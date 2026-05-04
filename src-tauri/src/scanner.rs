use anyhow::Result;
use lofty::file::TaggedFileExt;
use lofty::prelude::*;
use lofty::probe::Probe;
use lofty::tag::ItemKey;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

use crate::audio_formats;
use crate::db::{Db, TrackInsert};

pub struct ScanRunResult {
    pub total: usize,
    pub added: usize,
    pub live_files: Vec<String>,
}

pub fn find_audio_files(dir: &Path) -> Vec<PathBuf> {
    WalkDir::new(dir)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            e.depth() == 0
                || e.file_name()
                    .to_string_lossy()
                    .chars()
                    .next()
                    .map(|c| c != '.')
                    .unwrap_or(true)
        })
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|x| x.to_str())
                .map(audio_formats::is_audio_extension)
                .unwrap_or(false)
        })
        .map(|e| e.into_path())
        .collect()
}

pub fn should_rescan(
    existing_content_type: Option<&str>,
    existing_mtime: Option<i64>,
    file_mtime_ms: i64,
    content_type: &str,
) -> bool {
    let Some(prev_ct) = existing_content_type else {
        return true;
    };
    let Some(prev_mtime) = existing_mtime else {
        return true;
    };
    if prev_ct != content_type {
        return true;
    }
    prev_mtime != file_mtime_ms
}

pub fn scan_directory<F>(
    db: &Db,
    dir: &Path,
    content_type: &str,
    cancel: &impl Fn() -> bool,
    mut on_progress: F,
) -> Result<ScanRunResult>
where
    F: FnMut(usize, usize),
{
    let files = find_audio_files(dir);
    let total = files.len();
    let mut added = 0usize;
    let mut processed = 0usize;
    let mut live: Vec<String> = Vec::with_capacity(total);

    for path in &files {
        if cancel() {
            break;
        }
        let path_str = path.to_string_lossy().into_owned();
        live.push(path_str.clone());

        let mtime_ms = std::fs::metadata(path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        let existing = db.get_track_by_path(&path_str)?;
        let existing_ct = existing.as_ref().map(|r| r.content_type.as_str());
        let existing_mtime = existing.as_ref().and_then(|r| r.mtime);

        if !should_rescan(existing_ct, existing_mtime, mtime_ms, content_type) {
            processed += 1;
            on_progress(processed, total);
            continue;
        }

        match parse_track(&path_str, content_type, mtime_ms) {
            Ok(track) => {
                db.insert_track(&track)?;
                added += 1;
            }
            Err(e) => log::error!("scan: failed to parse {}: {}", path_str, e),
        }
        processed += 1;
        on_progress(processed, total);
    }

    Ok(ScanRunResult {
        total,
        added,
        live_files: live,
    })
}

fn parse_track(path: &str, content_type: &str, mtime_ms: i64) -> Result<TrackInsert> {
    let p = Path::new(path);
    let basename = p
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    let format = p
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase());

    let tagged = Probe::open(path)?.read()?;
    let primary = tagged.primary_tag();

    let title = primary
        .and_then(|t| t.get_string(ItemKey::TrackTitle).map(|s| s.to_string()))
        .unwrap_or(basename);
    let artist = primary
        .and_then(|t| t.get_string(ItemKey::TrackArtist).map(|s| s.to_string()))
        .unwrap_or_else(|| "Unknown".into());
    let album = primary
        .and_then(|t| t.get_string(ItemKey::AlbumTitle).map(|s| s.to_string()))
        .unwrap_or_else(|| "Unknown".into());
    let genre = primary.and_then(|t| t.get_string(ItemKey::Genre).map(|s| s.to_string()));
    let year = primary.and_then(|t| {
        t.get_string(ItemKey::Year)
            .and_then(|s| s.parse::<i64>().ok())
    });
    let bpm = primary.and_then(|t| {
        t.get_string(ItemKey::Bpm)
            .and_then(|s| s.parse::<f64>().ok())
    });

    let props = tagged.properties();
    let duration = props.duration().as_secs_f64();
    let sample_rate = props.sample_rate().map(|x| x as i64);
    let bitrate = props.audio_bitrate().map(|x| x as i64);

    Ok(TrackInsert {
        path: path.to_string(),
        content_type: content_type.to_string(),
        title: Some(title),
        artist: Some(artist),
        album: Some(album),
        genre,
        year,
        duration: Some(duration),
        bpm,
        sample_rate,
        bitrate,
        format,
        mtime: Some(mtime_ms),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_rescan_when_no_existing_row() {
        assert!(should_rescan(None, None, 100, "music"));
    }

    #[test]
    fn should_rescan_when_existing_lacks_mtime() {
        assert!(should_rescan(Some("music"), None, 100, "music"));
    }

    #[test]
    fn should_rescan_when_content_type_changed() {
        assert!(should_rescan(Some("jingle"), Some(100), 100, "music"));
    }

    #[test]
    fn should_rescan_when_mtime_differs() {
        assert!(should_rescan(Some("music"), Some(99), 100, "music"));
    }

    #[test]
    fn should_skip_when_unchanged() {
        assert!(!should_rescan(Some("music"), Some(100), 100, "music"));
    }
}
