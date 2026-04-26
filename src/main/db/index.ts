import BetterSqlite3 from "better-sqlite3";
import path from "path";
import { promises as fsp } from "fs";
import { app } from "electron";
import {
  Kysely,
  SqliteDialect,
  Migrator,
  FileMigrationProvider,
  sql,
} from "kysely";
import { ContentType, LibraryStats } from "../../types";
import { Database, Track, TrackInsert } from "./types";

let db: Kysely<Database>;
let sqlite: BetterSqlite3.Database;

export async function init(): Promise<Kysely<Database>> {
  const dbPath = path.join(app.getPath("userData"), "diodedj.db");
  sqlite = new BetterSqlite3(dbPath);
  sqlite.pragma("journal_mode = WAL");

  db = new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqlite }),
  });

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs: fsp,
      path,
      migrationFolder: path.join(__dirname, "migrations"),
    }),
  });
  const { error, results } = await migrator.migrateToLatest();
  if (error) {
    const failed = results?.find((r) => r.status === "Error");
    throw new Error(
      `Migration failed${failed ? ` at ${failed.migrationName}` : ""}: ${error}`,
    );
  }

  return db;
}

export async function search(
  query: string,
  contentType?: ContentType,
): Promise<Track[]> {
  if (!query?.trim()) {
    let q = db
      .selectFrom("tracks")
      .selectAll()
      .orderBy("artist")
      .orderBy("album")
      .orderBy("title")
      .limit(200);
    if (contentType) {
      q = q.where("content_type", "=", contentType);
    }
    return await q.execute();
  }
  const ftsQuery = query
    .trim()
    .split(/\s+/)
    .map((t) => `"${t}"*`)
    .join(" ");
  const result = contentType
    ? await sql<Track>`
        SELECT tracks.* FROM tracks_fts
        JOIN tracks ON tracks.id = tracks_fts.rowid
        WHERE tracks_fts MATCH ${ftsQuery} AND tracks.content_type = ${contentType}
        ORDER BY rank
        LIMIT 200
      `.execute(db)
    : await sql<Track>`
        SELECT tracks.* FROM tracks_fts
        JOIN tracks ON tracks.id = tracks_fts.rowid
        WHERE tracks_fts MATCH ${ftsQuery}
        ORDER BY rank
        LIMIT 200
      `.execute(db);
  return result.rows;
}

export async function getTrack(id: number): Promise<Track | undefined> {
  return db
    .selectFrom("tracks")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
}

export async function getRandomTracks(
  count: number,
  contentType: ContentType = "music",
): Promise<Track[]> {
  return db
    .selectFrom("tracks")
    .selectAll()
    .where("content_type", "=", contentType)
    .orderBy(sql`RANDOM()`)
    .limit(count)
    .execute();
}

export async function insertTrack(track: TrackInsert): Promise<void> {
  await db.replaceInto("tracks").values(track).execute();
}

export async function removeTracksNotInPaths(paths: string[]): Promise<number> {
  if (paths.length === 0) {
    const result = await db.deleteFrom("tracks").executeTakeFirst();
    return Number(result.numDeletedRows);
  }
  let q = db.deleteFrom("tracks");
  for (const p of paths) {
    q = q.where("path", "not like", `${p}%`);
  }
  const result = await q.executeTakeFirst();
  return Number(result.numDeletedRows);
}

export async function incrementPlayCount(id: number): Promise<void> {
  await db
    .updateTable("tracks")
    .set((eb) => ({ play_count: eb("play_count", "+", 1) }))
    .where("id", "=", id)
    .execute();
}

export async function getStats(): Promise<LibraryStats> {
  const result = await sql<LibraryStats>`
    SELECT
      COUNT(*) as totalTracks,
      COUNT(DISTINCT artist) as totalArtists,
      COUNT(DISTINCT album) as totalAlbums,
      ROUND(SUM(duration) / 3600.0, 1) as totalHours
    FROM tracks
  `.execute(db);
  return result.rows[0];
}

export async function close(): Promise<void> {
  if (db) await db.destroy();
}
