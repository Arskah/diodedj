import BetterSqlite3 from "better-sqlite3";
import path from "path";
import { app } from "electron";
import { Kysely, SqliteDialect, Migrator, Migration, sql } from "kysely";
import { ContentType, LibraryStats, SortColumn, SortDir } from "../../types";
import { Database, Track, TrackInsert } from "./types";
import * as initial from "./migrations/001_initial";
import * as trackMtime from "./migrations/002_track_mtime";

const migrations: Record<string, Migration> = {
  "001_initial": initial,
  "002_track_mtime": trackMtime,
};

let db: Kysely<Database>;
let sqlite: BetterSqlite3.Database;

export async function init(dbPath?: string): Promise<Kysely<Database>> {
  const resolvedPath =
    dbPath ?? path.join(app.getPath("userData"), "diodedj.db");
  sqlite = new BetterSqlite3(resolvedPath);
  sqlite.pragma("journal_mode = WAL");

  db = new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqlite }),
  });

  const migrator = new Migrator({
    db,
    provider: {
      getMigrations: async () => migrations,
    },
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

const SORT_COLUMNS: Record<SortColumn, string> = {
  title: "title",
  artist: "artist",
  album: "album",
  play_count: "play_count",
};

function orderClause(sortBy?: SortColumn, sortDir?: SortDir): string {
  if (!sortBy || !(sortBy in SORT_COLUMNS)) return "";
  const col = SORT_COLUMNS[sortBy];
  const dir = sortDir === "desc" ? "DESC" : "ASC";
  const collate = sortBy === "play_count" ? "" : "COLLATE NOCASE ";
  return `${col} ${collate}${dir}`;
}

export async function search(
  query: string,
  contentType?: ContentType,
  sortBy?: SortColumn,
  sortDir?: SortDir,
): Promise<Track[]> {
  const order = orderClause(sortBy, sortDir);
  if (!query?.trim()) {
    let q = db.selectFrom("tracks").selectAll();
    if (contentType) q = q.where("content_type", "=", contentType);
    if (order) {
      q = q.orderBy(sql.raw(order));
    } else {
      q = q.orderBy("artist").orderBy("album").orderBy("title");
    }
    return await q.limit(200).execute();
  }
  const ftsQuery = query
    .trim()
    .split(/\s+/)
    .map((t) => `"${t}"*`)
    .join(" ");
  const orderSql = order ? sql.raw(order) : sql.raw("rank");
  const result = contentType
    ? await sql<Track>`
        SELECT tracks.* FROM tracks_fts
        JOIN tracks ON tracks.id = tracks_fts.rowid
        WHERE tracks_fts MATCH ${ftsQuery} AND tracks.content_type = ${contentType}
        ORDER BY ${orderSql}
        LIMIT 200
      `.execute(db)
    : await sql<Track>`
        SELECT tracks.* FROM tracks_fts
        JOIN tracks ON tracks.id = tracks_fts.rowid
        WHERE tracks_fts MATCH ${ftsQuery}
        ORDER BY ${orderSql}
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

export async function getTracksByIds(ids: number[]): Promise<Track[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .selectFrom("tracks")
    .selectAll()
    .where("id", "in", ids)
    .execute();
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((t): t is Track => t !== undefined);
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
  await db
    .insertInto("tracks")
    .values(track)
    .onConflict((oc) =>
      oc.column("path").doUpdateSet({
        content_type: track.content_type,
        title: track.title,
        artist: track.artist,
        album: track.album,
        genre: track.genre,
        year: track.year,
        duration: track.duration,
        bpm: track.bpm,
        sample_rate: track.sample_rate,
        bitrate: track.bitrate,
        format: track.format,
        mtime: track.mtime,
      }),
    )
    .execute();
}

export async function getTrackByPath(p: string): Promise<Track | undefined> {
  return db
    .selectFrom("tracks")
    .selectAll()
    .where("path", "=", p)
    .executeTakeFirst();
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
  const totals = await sql<{
    totalTracks: number;
    totalArtists: number;
    totalAlbums: number;
    totalHours: number;
  }>`
    SELECT
      COUNT(*) as totalTracks,
      COUNT(DISTINCT artist) as totalArtists,
      COUNT(DISTINCT album) as totalAlbums,
      ROUND(SUM(duration) / 3600.0, 1) as totalHours
    FROM tracks
  `.execute(db);
  const counts = await sql<{ content_type: ContentType; count: number }>`
    SELECT content_type, COUNT(*) as count
    FROM tracks
    GROUP BY content_type
  `.execute(db);
  const tracksByType: Record<ContentType, number> = {
    music: 0,
    commercial: 0,
    jingle: 0,
  };
  for (const row of counts.rows) tracksByType[row.content_type] = row.count;
  return { ...totals.rows[0], tracksByType };
}

export async function getBottomNByPlayCount(
  contentType: ContentType,
  n: number,
): Promise<Track[]> {
  if (n <= 0) return [];
  return db
    .selectFrom("tracks")
    .selectAll()
    .where("content_type", "=", contentType)
    .orderBy("play_count", "asc")
    .limit(n)
    .execute();
}

export async function close(): Promise<void> {
  if (db) await db.destroy();
}
