import Database from "better-sqlite3";
import path from "path";
import { app } from "electron";
import { ContentType, Track, TrackInsert, LibraryStats } from "../types";

let db: Database.Database;

export function init(): Database.Database {
  const dbPath = path.join(app.getPath("userData"), "diodedj.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'music',
      title TEXT,
      artist TEXT,
      album TEXT,
      genre TEXT,
      year INTEGER,
      duration REAL,
      bpm REAL,
      sample_rate INTEGER,
      bitrate INTEGER,
      format TEXT,
      added_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migration: add content_type if missing
  const cols = db.pragma("table_info(tracks)") as { name: string }[];
  if (!cols.some((c) => c.name === "content_type")) {
    db.exec(
      `ALTER TABLE tracks ADD COLUMN content_type TEXT NOT NULL DEFAULT 'music'`,
    );
  }

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
      title, artist, album, genre,
      content='tracks',
      content_rowid='id'
    )
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS tracks_ai AFTER INSERT ON tracks BEGIN
      INSERT INTO tracks_fts(rowid, title, artist, album, genre)
      VALUES (new.id, new.title, new.artist, new.album, new.genre);
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS tracks_ad AFTER DELETE ON tracks BEGIN
      INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, genre)
      VALUES ('delete', old.id, old.title, old.artist, old.album, old.genre);
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS tracks_au AFTER UPDATE ON tracks BEGIN
      INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, genre)
      VALUES ('delete', old.id, old.title, old.artist, old.album, old.genre);
      INSERT INTO tracks_fts(rowid, title, artist, album, genre)
      VALUES (new.id, new.title, new.artist, new.album, new.genre);
    END
  `);

  return db;
}

export function search(query: string, contentType?: ContentType): Track[] {
  if (!query?.trim()) {
    if (contentType) {
      return db
        .prepare(
          "SELECT * FROM tracks WHERE content_type = ? ORDER BY artist, album, title LIMIT 200",
        )
        .all(contentType) as Track[];
    }
    return db
      .prepare("SELECT * FROM tracks ORDER BY artist, album, title LIMIT 200")
      .all() as Track[];
  }
  const ftsQuery = query
    .trim()
    .split(/\s+/)
    .map((t) => `"${t}"*`)
    .join(" ");
  if (contentType) {
    return db
      .prepare(
        `
      SELECT tracks.* FROM tracks_fts
      JOIN tracks ON tracks.id = tracks_fts.rowid
      WHERE tracks_fts MATCH ? AND tracks.content_type = ?
      ORDER BY rank
      LIMIT 200
    `,
      )
      .all(ftsQuery, contentType) as Track[];
  }
  return db
    .prepare(
      `
    SELECT tracks.* FROM tracks_fts
    JOIN tracks ON tracks.id = tracks_fts.rowid
    WHERE tracks_fts MATCH ?
    ORDER BY rank
    LIMIT 200
  `,
    )
    .all(ftsQuery) as Track[];
}

export function getTrack(id: number): Track | undefined {
  return db.prepare("SELECT * FROM tracks WHERE id = ?").get(id) as
    | Track
    | undefined;
}

export function getRandomTracks(
  count: number,
  contentType: ContentType = "music",
): Track[] {
  return db
    .prepare(
      "SELECT * FROM tracks WHERE content_type = ? ORDER BY RANDOM() LIMIT ?",
    )
    .all(contentType, count) as Track[];
}

export function insertTrack(track: TrackInsert): Database.RunResult {
  return db
    .prepare(
      `
    INSERT OR REPLACE INTO tracks (path, content_type, title, artist, album, genre, year, duration, bpm, sample_rate, bitrate, format)
    VALUES (@path, @content_type, @title, @artist, @album, @genre, @year, @duration, @bpm, @sample_rate, @bitrate, @format)
  `,
    )
    .run(track);
}

export function removeTracksNotInPaths(paths: string[]): number {
  if (paths.length === 0) {
    const result = db.prepare("DELETE FROM tracks").run();
    return result.changes;
  }
  const where = paths.map(() => "path NOT LIKE ?").join(" AND ");
  const patterns = paths.map((p) => `${p}%`);
  const result = db
    .prepare(`DELETE FROM tracks WHERE ${where}`)
    .run(...patterns);
  return result.changes;
}

export function getStats(): LibraryStats {
  return db
    .prepare(
      `
    SELECT
      COUNT(*) as totalTracks,
      COUNT(DISTINCT artist) as totalArtists,
      COUNT(DISTINCT album) as totalAlbums,
      ROUND(SUM(duration) / 3600.0, 1) as totalHours
    FROM tracks
  `,
    )
    .get() as LibraryStats;
}

export function close(): void {
  if (db) db.close();
}
