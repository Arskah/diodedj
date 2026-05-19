use anyhow::{Context, Result};
use std::fs;
use std::path::{Path, PathBuf};

use super::payload::{track_text_line, Payload};

const TXT_NAME: &str = "now_playing.txt";
const JSON_NAME: &str = "now_playing.json";

/// Atomic file writer for now-playing state.
///
/// Writes `now_playing.json` and `now_playing.txt` via tmp+rename.
/// JSON written first, then TXT — OBS / scripted consumers reading TXT
/// after JSON observe a consistent snapshot.
pub struct FileSink {
    dir: PathBuf,
}

impl FileSink {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    /// Write current state. Track-start writes both files with content;
    /// stop truncates both to empty (also via atomic rename).
    pub fn write(&self, payload: &Payload) -> Result<()> {
        fs::create_dir_all(&self.dir).with_context(|| {
            format!("create now-playing dir {}", self.dir.display())
        })?;

        let (json, text) = match payload {
            Payload::NowPlaying(p) => {
                let json = serde_json::to_string_pretty(p)?;
                let text = track_text_line(&p.track);
                (json, text)
            }
            Payload::Stopped(p) => {
                let json = serde_json::to_string_pretty(p)?;
                (json, String::new())
            }
        };

        atomic_write(&self.dir.join(JSON_NAME), json.as_bytes())?;
        atomic_write(&self.dir.join(TXT_NAME), text.as_bytes())?;
        Ok(())
    }
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let tmp = tmp_sibling(path);
    fs::write(&tmp, bytes)
        .with_context(|| format!("write {}", tmp.display()))?;
    fs::rename(&tmp, path)
        .with_context(|| format!("rename {} -> {}", tmp.display(), path.display()))?;
    Ok(())
}

fn tmp_sibling(path: &Path) -> PathBuf {
    let mut name = path
        .file_name()
        .map(|f| f.to_os_string())
        .unwrap_or_default();
    name.push(".tmp");
    path.with_file_name(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::broadcast::payload::BroadcastTrack;
    use chrono::DateTime;
    use tempfile::tempdir;

    fn track() -> BroadcastTrack {
        BroadcastTrack {
            id: 1,
            title: "Song".into(),
            artist: "Artist".into(),
            album: "Album".into(),
            genre: Some("Rock".into()),
            duration_sec: 100.0,
            content_type: "music".into(),
            path: "/p/song.mp3".into(),
        }
    }

    #[test]
    fn now_playing_writes_both_files_with_content() {
        let dir = tempdir().unwrap();
        let sink = FileSink::new(dir.path().to_path_buf());
        let ts: DateTime<chrono::Utc> = "2026-05-19T00:00:00Z".parse().unwrap();
        sink.write(&Payload::now_playing(track(), ts)).unwrap();

        let txt = fs::read_to_string(dir.path().join(TXT_NAME)).unwrap();
        assert_eq!(txt, "Artist - Song");

        let json = fs::read_to_string(dir.path().join(JSON_NAME)).unwrap();
        assert!(json.contains("\"event\": \"now_playing\""));
        assert!(json.contains("\"title\": \"Song\""));
    }

    #[test]
    fn stopped_truncates_txt_and_writes_stopped_payload_to_json() {
        let dir = tempdir().unwrap();
        let sink = FileSink::new(dir.path().to_path_buf());
        let ts: DateTime<chrono::Utc> = "2026-05-19T00:00:00Z".parse().unwrap();
        sink.write(&Payload::now_playing(track(), ts)).unwrap();
        sink.write(&Payload::stopped(ts)).unwrap();

        let txt = fs::read_to_string(dir.path().join(TXT_NAME)).unwrap();
        assert_eq!(txt, "");

        let json = fs::read_to_string(dir.path().join(JSON_NAME)).unwrap();
        assert!(json.contains("\"event\": \"stopped\""));
        assert!(json.contains("\"stoppedAt\": \"2026-05-19T00:00:00Z\""));
        // Must remain valid JSON.
        let _: serde_json::Value = serde_json::from_str(&json).unwrap();
    }

    #[test]
    fn artist_empty_yields_title_only_in_txt() {
        let dir = tempdir().unwrap();
        let sink = FileSink::new(dir.path().to_path_buf());
        let mut t = track();
        t.artist = "".into();
        let ts: DateTime<chrono::Utc> = "2026-05-19T00:00:00Z".parse().unwrap();
        sink.write(&Payload::now_playing(t, ts)).unwrap();

        let txt = fs::read_to_string(dir.path().join(TXT_NAME)).unwrap();
        assert_eq!(txt, "Song");
    }

    #[test]
    fn writes_create_missing_directory() {
        let dir = tempdir().unwrap();
        let nested = dir.path().join("a/b/c");
        let sink = FileSink::new(nested.clone());
        let ts: DateTime<chrono::Utc> = "2026-05-19T00:00:00Z".parse().unwrap();
        sink.write(&Payload::now_playing(track(), ts)).unwrap();
        assert!(nested.join(TXT_NAME).exists());
        assert!(nested.join(JSON_NAME).exists());
    }

    #[test]
    fn no_lingering_tmp_files_after_write() {
        let dir = tempdir().unwrap();
        let sink = FileSink::new(dir.path().to_path_buf());
        let ts: DateTime<chrono::Utc> = "2026-05-19T00:00:00Z".parse().unwrap();
        sink.write(&Payload::now_playing(track(), ts)).unwrap();

        let entries: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().into_string().unwrap())
            .collect();
        assert!(!entries.iter().any(|n| n.ends_with(".tmp")));
        assert_eq!(entries.len(), 2);
    }
}
