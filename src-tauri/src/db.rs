use anyhow::{Context, Result};
use parking_lot::Mutex;
use rusqlite::{params, params_from_iter, Connection, Row};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Serialize, Deserialize, Clone)]
pub struct Track {
    pub id: i64,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: f64,
    pub play_count: i64,
    pub genre: Option<String>,
    pub year: Option<i64>,
    pub bpm: Option<f64>,
    pub sample_rate: Option<i64>,
    pub bitrate: Option<i64>,
    pub format: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct LibraryStats {
    pub total_tracks: i64,
    pub total_artists: i64,
    pub total_albums: i64,
    pub total_hours: f64,
    pub tracks_by_type: TracksByType,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct TracksByType {
    pub music: i64,
    pub commercial: i64,
    pub jingle: i64,
}

#[derive(Default, Clone)]
pub struct TrackInsert {
    pub path: String,
    pub content_type: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub genre: Option<String>,
    pub year: Option<i64>,
    pub duration: Option<f64>,
    pub bpm: Option<f64>,
    pub sample_rate: Option<i64>,
    pub bitrate: Option<i64>,
    pub format: Option<String>,
    pub mtime: Option<i64>,
}

pub struct TrackMtimeRow {
    pub content_type: String,
    pub mtime: Option<i64>,
}

pub struct MediaTrack {
    pub path: String,
    pub format: String,
    pub duration: f64,
}

pub struct Db {
    conn: Mutex<Connection>,
}

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path).context("open sqlite")?;
        conn.execute_batch("PRAGMA journal_mode = WAL;")?;
        Self::with_connection(conn)
    }

    fn with_connection(conn: Connection) -> Result<Self> {
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self> {
        Self::with_connection(Connection::open_in_memory()?)
    }

    fn migrate(&self) -> Result<()> {
        let conn = self.conn.lock();
        let v: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
        if v < 1 {
            conn.execute_batch(MIGRATION_001)?;
        }
        if v < 2 {
            conn.execute_batch(MIGRATION_002)?;
        }
        conn.pragma_update(None, "user_version", 2)?;
        Ok(())
    }

    pub fn search(
        &self,
        query: &str,
        content_type: Option<&str>,
        sort_by: Option<&str>,
        sort_dir: Option<&str>,
    ) -> Result<Vec<Track>> {
        let conn = self.conn.lock();
        let order = order_clause(sort_by, sort_dir);
        let trimmed = query.trim();

        if trimmed.is_empty() {
            let order_sql = order.unwrap_or_else(|| {
                "artist COLLATE NOCASE, album COLLATE NOCASE, title COLLATE NOCASE".into()
            });
            let (sql, params): (String, Vec<rusqlite::types::Value>) = if let Some(t) = content_type
            {
                (
                    format!(
                        "SELECT * FROM tracks WHERE content_type = ? ORDER BY {} LIMIT 200",
                        order_sql
                    ),
                    vec![t.to_owned().into()],
                )
            } else {
                (
                    format!("SELECT * FROM tracks ORDER BY {} LIMIT 200", order_sql),
                    vec![],
                )
            };
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map(params_from_iter(params.iter()), row_to_track)?;
            return rows.collect::<rusqlite::Result<_>>().map_err(Into::into);
        }

        let fts_q = trimmed
            .split_whitespace()
            .map(|t| format!("\"{}\"*", t))
            .collect::<Vec<_>>()
            .join(" ");
        let order_sql = order.unwrap_or_else(|| "rank".to_string());

        let (sql, params): (String, Vec<rusqlite::types::Value>) = if let Some(t) = content_type {
            (
                format!(
                    "SELECT tracks.* FROM tracks_fts \
                     JOIN tracks ON tracks.id = tracks_fts.rowid \
                     WHERE tracks_fts MATCH ? AND tracks.content_type = ? \
                     ORDER BY {} LIMIT 200",
                    order_sql
                ),
                vec![fts_q.into(), t.to_owned().into()],
            )
        } else {
            (
                format!(
                    "SELECT tracks.* FROM tracks_fts \
                     JOIN tracks ON tracks.id = tracks_fts.rowid \
                     WHERE tracks_fts MATCH ? \
                     ORDER BY {} LIMIT 200",
                    order_sql
                ),
                vec![fts_q.into()],
            )
        };
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(params.iter()), row_to_track)?;
        rows.collect::<rusqlite::Result<_>>().map_err(Into::into)
    }

    pub fn get_media_track(&self, id: i64) -> Result<Option<MediaTrack>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare("SELECT path, format, duration FROM tracks WHERE id = ?")?;
        let mut rows = stmt.query_map([id], |r| {
            Ok(MediaTrack {
                path: r.get(0)?,
                format: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                duration: r.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
            })
        })?;
        match rows.next() {
            Some(r) => r.map(Some).map_err(Into::into),
            None => Ok(None),
        }
    }

    pub fn get_track(&self, id: i64) -> Result<Option<Track>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare("SELECT * FROM tracks WHERE id = ?")?;
        let mut rows = stmt.query_map([id], row_to_track)?;
        match rows.next() {
            Some(r) => r.map(Some).map_err(Into::into),
            None => Ok(None),
        }
    }

    pub fn get_tracks_by_ids(&self, ids: &[i64]) -> Result<Vec<Track>> {
        if ids.is_empty() {
            return Ok(vec![]);
        }
        let conn = self.conn.lock();
        let placeholders = std::iter::repeat("?")
            .take(ids.len())
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!("SELECT * FROM tracks WHERE id IN ({})", placeholders);
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(ids.iter()), row_to_track)?;
        let by_id: HashMap<i64, Track> = rows
            .collect::<rusqlite::Result<Vec<Track>>>()?
            .into_iter()
            .map(|t| (t.id, t))
            .collect();
        Ok(ids.iter().filter_map(|i| by_id.get(i).cloned()).collect())
    }

    pub fn insert_track(&self, t: &TrackInsert) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO tracks \
             (path, content_type, title, artist, album, genre, year, duration, bpm, \
              sample_rate, bitrate, format, mtime) \
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) \
             ON CONFLICT(path) DO UPDATE SET \
                content_type=excluded.content_type, \
                title=excluded.title, artist=excluded.artist, album=excluded.album, \
                genre=excluded.genre, year=excluded.year, duration=excluded.duration, \
                bpm=excluded.bpm, sample_rate=excluded.sample_rate, \
                bitrate=excluded.bitrate, format=excluded.format, mtime=excluded.mtime",
            params![
                t.path,
                t.content_type,
                t.title,
                t.artist,
                t.album,
                t.genre,
                t.year,
                t.duration,
                t.bpm,
                t.sample_rate,
                t.bitrate,
                t.format,
                t.mtime,
            ],
        )?;
        Ok(())
    }

    pub fn get_track_by_path(&self, path: &str) -> Result<Option<TrackMtimeRow>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT content_type, mtime FROM tracks WHERE path = ?",
        )?;
        let mut rows = stmt.query_map([path], |r| {
            Ok(TrackMtimeRow {
                content_type: r.get(0)?,
                mtime: r.get::<_, Option<i64>>(1)?,
            })
        })?;
        match rows.next() {
            Some(r) => r.map(Some).map_err(Into::into),
            None => Ok(None),
        }
    }

    pub fn get_paths_under(&self, root: &str) -> Result<Vec<String>> {
        let conn = self.conn.lock();
        let pattern = format!("{}%", root);
        let mut stmt = conn.prepare("SELECT path FROM tracks WHERE path LIKE ?")?;
        let rows = stmt.query_map([pattern], |r| r.get::<_, String>(0))?;
        rows.collect::<rusqlite::Result<_>>().map_err(Into::into)
    }

    pub fn delete_by_paths(&self, paths: &[String]) -> Result<usize> {
        if paths.is_empty() {
            return Ok(0);
        }
        let mut conn = self.conn.lock();
        let tx = conn.transaction()?;
        let mut total = 0usize;
        for chunk in paths.chunks(500) {
            let placeholders = std::iter::repeat("?")
                .take(chunk.len())
                .collect::<Vec<_>>()
                .join(",");
            let sql = format!("DELETE FROM tracks WHERE path IN ({})", placeholders);
            total += tx.execute(&sql, params_from_iter(chunk.iter()))?;
        }
        tx.commit()?;
        Ok(total)
    }

    pub fn remove_tracks_not_in_paths(&self, roots: &[String]) -> Result<usize> {
        let conn = self.conn.lock();
        if roots.is_empty() {
            let n = conn.execute("DELETE FROM tracks", [])?;
            return Ok(n);
        }
        let mut where_parts = Vec::new();
        let mut p: Vec<rusqlite::types::Value> = Vec::new();
        for r in roots {
            where_parts.push("path NOT LIKE ?".to_string());
            p.push(format!("{}%", r).into());
        }
        let sql = format!("DELETE FROM tracks WHERE {}", where_parts.join(" AND "));
        let n = conn.execute(&sql, params_from_iter(p.iter()))?;
        Ok(n)
    }

    pub fn increment_play_count(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE tracks SET play_count = play_count + 1 WHERE id = ?",
            [id],
        )?;
        Ok(())
    }

    pub fn get_random_tracks(&self, content_type: &str, count: i64) -> Result<Vec<Track>> {
        if count <= 0 {
            return Ok(vec![]);
        }
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT * FROM tracks WHERE content_type = ? ORDER BY RANDOM() LIMIT ?",
        )?;
        let rows = stmt.query_map(rusqlite::params![content_type, count], row_to_track)?;
        rows.collect::<rusqlite::Result<_>>().map_err(Into::into)
    }

    pub fn pick_random_from_bottom(
        &self,
        content_type: &str,
        bucket_size: i64,
    ) -> Result<Option<Track>> {
        if bucket_size <= 0 {
            return Ok(None);
        }
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "WITH bucket AS ( \
                SELECT * FROM tracks WHERE content_type = ? \
                ORDER BY play_count ASC LIMIT ? \
            ) SELECT * FROM bucket ORDER BY RANDOM() LIMIT 1",
        )?;
        let mut rows =
            stmt.query_map(rusqlite::params![content_type, bucket_size], row_to_track)?;
        match rows.next() {
            Some(r) => r.map(Some).map_err(Into::into),
            None => Ok(None),
        }
    }

    pub fn get_stats(&self) -> Result<LibraryStats> {
        let conn = self.conn.lock();
        let (total_tracks, total_artists, total_albums, total_hours): (i64, i64, i64, f64) = conn
            .query_row(
                "SELECT COUNT(*), COUNT(DISTINCT artist), COUNT(DISTINCT album), \
                 COALESCE(ROUND(SUM(duration) / 3600.0, 1), 0) FROM tracks",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )?;
        let mut tracks_by_type = TracksByType::default();
        let mut stmt = conn.prepare(
            "SELECT content_type, COUNT(*) FROM tracks GROUP BY content_type",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })?;
        for row in rows {
            let (kind, n) = row?;
            match kind.as_str() {
                "music" => tracks_by_type.music = n,
                "commercial" => tracks_by_type.commercial = n,
                "jingle" => tracks_by_type.jingle = n,
                _ => {}
            }
        }
        Ok(LibraryStats {
            total_tracks,
            total_artists,
            total_albums,
            total_hours,
            tracks_by_type,
        })
    }
}

fn order_clause(sort_by: Option<&str>, sort_dir: Option<&str>) -> Option<String> {
    let col = sort_by?;
    if !matches!(col, "title" | "artist" | "album" | "play_count") {
        return None;
    }
    let dir = if matches!(sort_dir, Some("desc")) {
        "DESC"
    } else {
        "ASC"
    };
    let collate = if col == "play_count" {
        ""
    } else {
        "COLLATE NOCASE "
    };
    Some(format!("{} {}{}", col, collate, dir))
}

fn row_to_track(row: &Row) -> rusqlite::Result<Track> {
    Ok(Track {
        id: row.get("id")?,
        title: row.get::<_, Option<String>>("title")?.unwrap_or_default(),
        artist: row.get::<_, Option<String>>("artist")?.unwrap_or_default(),
        album: row.get::<_, Option<String>>("album")?.unwrap_or_default(),
        duration: row.get::<_, Option<f64>>("duration")?.unwrap_or(0.0),
        play_count: row.get("play_count")?,
        genre: row.get("genre")?,
        year: row.get("year")?,
        bpm: row.get("bpm")?,
        sample_rate: row.get("sample_rate")?,
        bitrate: row.get("bitrate")?,
        format: row.get("format")?,
    })
}

const MIGRATION_001: &str = r#"
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
);

CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
  title, artist, album, genre,
  content='tracks',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS tracks_ai AFTER INSERT ON tracks BEGIN
  INSERT INTO tracks_fts(rowid, title, artist, album, genre)
  VALUES (new.id, new.title, new.artist, new.album, new.genre);
END;

CREATE TRIGGER IF NOT EXISTS tracks_ad AFTER DELETE ON tracks BEGIN
  INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, genre)
  VALUES ('delete', old.id, old.title, old.artist, old.album, old.genre);
END;

CREATE TRIGGER IF NOT EXISTS tracks_au AFTER UPDATE ON tracks BEGIN
  INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, genre)
  VALUES ('delete', old.id, old.title, old.artist, old.album, old.genre);
  INSERT INTO tracks_fts(rowid, title, artist, album, genre)
  VALUES (new.id, new.title, new.artist, new.album, new.genre);
END;
"#;

const MIGRATION_002: &str = "ALTER TABLE tracks ADD COLUMN mtime INTEGER;";

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn insert(
        db: &Db,
        path: &str,
        title: &str,
        artist: &str,
        album: &str,
        content_type: &str,
    ) {
        let conn = db.conn.lock();
        conn.execute(
            "INSERT INTO tracks (path, content_type, title, artist, album, duration, play_count) \
             VALUES (?, ?, ?, ?, ?, 100.0, 0)",
            params![path, content_type, title, artist, album],
        )
        .unwrap();
    }

    #[test]
    fn migrate_sets_user_version() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock();
        let v: i64 = conn
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert_eq!(v, 2);
    }

    #[test]
    fn fts5_search_finds_track_by_title_prefix() {
        let db = Db::open_in_memory().unwrap();
        insert(&db, "/a.mp3", "Hello World", "Band", "Album", "music");
        insert(&db, "/b.mp3", "Other", "Band", "Album", "music");
        let r = db.search("hel", None, None, None).unwrap();
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].title, "Hello World");
    }

    #[test]
    fn search_filters_by_content_type() {
        let db = Db::open_in_memory().unwrap();
        insert(&db, "/a.mp3", "Hello", "X", "Y", "music");
        insert(&db, "/b.mp3", "Hello", "X", "Y", "jingle");
        let r = db.search("hello", Some("music"), None, None).unwrap();
        assert_eq!(r.len(), 1);
        let r = db.search("hello", Some("jingle"), None, None).unwrap();
        assert_eq!(r.len(), 1);
    }

    #[test]
    fn empty_query_lists_with_default_order() {
        let db = Db::open_in_memory().unwrap();
        insert(&db, "/a.mp3", "T", "Beta", "Y", "music");
        insert(&db, "/b.mp3", "T", "Alpha", "Y", "music");
        let r = db.search("", None, None, None).unwrap();
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].artist, "Alpha");
        assert_eq!(r[1].artist, "Beta");
    }

    #[test]
    fn sort_by_play_count_desc() {
        let db = Db::open_in_memory().unwrap();
        insert(&db, "/a.mp3", "A", "X", "Y", "music");
        insert(&db, "/b.mp3", "B", "X", "Y", "music");
        db.increment_play_count(2).unwrap();
        db.increment_play_count(2).unwrap();
        db.increment_play_count(1).unwrap();
        let r = db.search("", None, Some("play_count"), Some("desc")).unwrap();
        assert_eq!(r[0].id, 2);
        assert_eq!(r[1].id, 1);
    }

    #[test]
    fn get_stats_counts_by_type() {
        let db = Db::open_in_memory().unwrap();
        insert(&db, "/a.mp3", "T", "X", "Y", "music");
        insert(&db, "/b.mp3", "T", "X", "Y", "music");
        insert(&db, "/c.mp3", "T", "X", "Y", "jingle");
        let s = db.get_stats().unwrap();
        assert_eq!(s.total_tracks, 3);
        assert_eq!(s.tracks_by_type.music, 2);
        assert_eq!(s.tracks_by_type.jingle, 1);
        assert_eq!(s.tracks_by_type.commercial, 0);
    }

    #[test]
    fn get_tracks_by_ids_preserves_order_and_skips_missing() {
        let db = Db::open_in_memory().unwrap();
        insert(&db, "/a.mp3", "A", "X", "Y", "music"); // id=1
        insert(&db, "/b.mp3", "B", "X", "Y", "music"); // id=2
        let r = db.get_tracks_by_ids(&[2, 99, 1]).unwrap();
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].id, 2);
        assert_eq!(r[1].id, 1);
    }

    #[test]
    fn increment_play_count_persists() {
        let db = Db::open_in_memory().unwrap();
        insert(&db, "/a.mp3", "A", "X", "Y", "music");
        db.increment_play_count(1).unwrap();
        db.increment_play_count(1).unwrap();
        let t = db.get_track(1).unwrap().unwrap();
        assert_eq!(t.play_count, 2);
    }
}

