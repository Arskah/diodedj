import { Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
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
      play_count INTEGER NOT NULL DEFAULT 0,
      added_at TEXT DEFAULT (datetime('now'))
    )
  `.execute(db);

  await sql`
    CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
      title, artist, album, genre,
      content='tracks',
      content_rowid='id'
    )
  `.execute(db);

  await sql`
    CREATE TRIGGER IF NOT EXISTS tracks_ai AFTER INSERT ON tracks BEGIN
      INSERT INTO tracks_fts(rowid, title, artist, album, genre)
      VALUES (new.id, new.title, new.artist, new.album, new.genre);
    END
  `.execute(db);

  await sql`
    CREATE TRIGGER IF NOT EXISTS tracks_ad AFTER DELETE ON tracks BEGIN
      INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, genre)
      VALUES ('delete', old.id, old.title, old.artist, old.album, old.genre);
    END
  `.execute(db);

  await sql`
    CREATE TRIGGER IF NOT EXISTS tracks_au AFTER UPDATE ON tracks BEGIN
      INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, genre)
      VALUES ('delete', old.id, old.title, old.artist, old.album, old.genre);
      INSERT INTO tracks_fts(rowid, title, artist, album, genre)
      VALUES (new.id, new.title, new.artist, new.album, new.genre);
    END
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS tracks_au`.execute(db);
  await sql`DROP TRIGGER IF EXISTS tracks_ad`.execute(db);
  await sql`DROP TRIGGER IF EXISTS tracks_ai`.execute(db);
  await sql`DROP TABLE IF EXISTS tracks_fts`.execute(db);
  await sql`DROP TABLE IF EXISTS tracks`.execute(db);
}
