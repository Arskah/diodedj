use anyhow::{Context, Result};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default)]
    pub music_paths: Vec<String>,
    #[serde(default)]
    pub commercial_paths: Vec<String>,
    #[serde(default)]
    pub jingle_paths: Vec<String>,
}

pub struct Config {
    path: PathBuf,
    inner: Mutex<AppConfig>,
}

impl Config {
    pub fn open(dir: &Path) -> Result<Self> {
        let path = dir.join("config.json");
        let inner = Self::load(&path).unwrap_or_default();
        Ok(Self {
            path,
            inner: Mutex::new(inner),
        })
    }

    fn load(path: &Path) -> Option<AppConfig> {
        let raw = fs::read_to_string(path).ok()?;
        let mut parsed: serde_json::Value = serde_json::from_str(&raw).ok()?;
        if let Some(obj) = parsed.as_object_mut() {
            if !obj.contains_key("musicPaths") {
                if let Some(legacy) = obj.remove("libraryPaths") {
                    obj.insert("musicPaths".into(), legacy);
                }
            }
        }
        serde_json::from_value::<AppConfig>(parsed).ok()
    }

    fn save_locked(&self, cfg: &AppConfig) -> Result<()> {
        let json = serde_json::to_string_pretty(cfg)?;
        fs::write(&self.path, json).context("write config.json")?;
        Ok(())
    }

    pub fn get_paths(&self, kind: &str) -> Vec<String> {
        let cfg = self.inner.lock();
        match kind {
            "music" => cfg.music_paths.clone(),
            "commercial" => cfg.commercial_paths.clone(),
            "jingle" => cfg.jingle_paths.clone(),
            _ => vec![],
        }
    }

    pub fn get_all_paths(&self) -> serde_json::Value {
        let cfg = self.inner.lock();
        serde_json::json!({
            "music": cfg.music_paths,
            "commercial": cfg.commercial_paths,
            "jingle": cfg.jingle_paths,
        })
    }

    pub fn get_all_paths_flat(&self) -> Vec<String> {
        let cfg = self.inner.lock();
        let mut out = cfg.music_paths.clone();
        out.extend(cfg.commercial_paths.iter().cloned());
        out.extend(cfg.jingle_paths.iter().cloned());
        out
    }

    pub fn add_path(&self, kind: &str, dir_path: &str) -> Result<bool> {
        let resolved = canonicalize_lossy(dir_path);
        let mut cfg = self.inner.lock();
        let arr = match kind {
            "music" => &mut cfg.music_paths,
            "commercial" => &mut cfg.commercial_paths,
            "jingle" => &mut cfg.jingle_paths,
            _ => return Ok(false),
        };
        if arr.contains(&resolved) {
            return Ok(false);
        }
        arr.push(resolved);
        self.save_locked(&cfg)?;
        Ok(true)
    }

    pub fn remove_path(&self, kind: &str, dir_path: &str) -> Result<bool> {
        let resolved = canonicalize_lossy(dir_path);
        let mut cfg = self.inner.lock();
        let arr = match kind {
            "music" => &mut cfg.music_paths,
            "commercial" => &mut cfg.commercial_paths,
            "jingle" => &mut cfg.jingle_paths,
            _ => return Ok(false),
        };
        if let Some(idx) = arr.iter().position(|p| p == &resolved) {
            arr.remove(idx);
            self.save_locked(&cfg)?;
            return Ok(true);
        }
        Ok(false)
    }
}

fn canonicalize_lossy(p: &str) -> String {
    fs::canonicalize(p)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| p.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn load_defaults_when_missing() {
        let dir = tempdir().unwrap();
        let cfg = Config::open(dir.path()).unwrap();
        assert!(cfg.get_paths("music").is_empty());
    }

    #[test]
    fn add_remove_round_trips_to_disk() {
        let dir = tempdir().unwrap();
        let cfg = Config::open(dir.path()).unwrap();
        let added = cfg.add_path("music", dir.path().to_str().unwrap()).unwrap();
        assert!(added);
        // re-add returns false (already present)
        let again = cfg.add_path("music", dir.path().to_str().unwrap()).unwrap();
        assert!(!again);

        // reopen reads persisted state
        drop(cfg);
        let cfg2 = Config::open(dir.path()).unwrap();
        assert_eq!(cfg2.get_paths("music").len(), 1);

        let removed = cfg2
            .remove_path("music", dir.path().to_str().unwrap())
            .unwrap();
        assert!(removed);
        assert!(cfg2.get_paths("music").is_empty());
    }

    #[test]
    fn migrates_legacy_library_paths_field() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"libraryPaths": ["/old"]}"#).unwrap();
        let cfg = Config::open(dir.path()).unwrap();
        assert_eq!(cfg.get_paths("music"), vec!["/old".to_string()]);
    }

    #[test]
    fn unknown_kind_is_noop() {
        let dir = tempdir().unwrap();
        let cfg = Config::open(dir.path()).unwrap();
        assert!(!cfg.add_path("bogus", "/x").unwrap());
        assert!(cfg.get_paths("bogus").is_empty());
    }
}
