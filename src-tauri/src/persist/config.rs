use anyhow::{Context, Result};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Default, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeviceRef {
    pub name: String,
    pub description: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NowPlayingConfig {
    #[serde(default)]
    pub webhook_url: Option<String>,
    #[serde(default)]
    pub webhook_secret: Option<String>,
    #[serde(default)]
    pub file_dir: Option<String>,
    #[serde(default = "default_true")]
    pub file_enabled: bool,
    #[serde(default = "default_true")]
    pub webhook_enabled: bool,
}

fn default_true() -> bool {
    true
}

impl Default for NowPlayingConfig {
    fn default() -> Self {
        Self {
            webhook_url: None,
            webhook_secret: None,
            file_dir: None,
            file_enabled: true,
            webhook_enabled: true,
        }
    }
}

#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default)]
    pub music_paths: Vec<String>,
    #[serde(default)]
    pub commercial_paths: Vec<String>,
    #[serde(default)]
    pub jingle_paths: Vec<String>,
    #[serde(default)]
    pub main_device: Option<DeviceRef>,
    #[serde(default)]
    pub cue_device: Option<DeviceRef>,
    #[serde(default)]
    pub now_playing: NowPlayingConfig,
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

    pub fn get_main_device(&self) -> Option<DeviceRef> {
        self.inner.lock().main_device.clone()
    }

    pub fn set_main_device(&self, device: Option<DeviceRef>) -> Result<()> {
        let mut cfg = self.inner.lock();
        cfg.main_device = device;
        self.save_locked(&cfg)
    }

    pub fn get_cue_device(&self) -> Option<DeviceRef> {
        self.inner.lock().cue_device.clone()
    }

    pub fn set_cue_device(&self, device: Option<DeviceRef>) -> Result<()> {
        let mut cfg = self.inner.lock();
        cfg.cue_device = device;
        self.save_locked(&cfg)
    }

    pub fn get_now_playing(&self) -> NowPlayingConfig {
        self.inner.lock().now_playing.clone()
    }

    pub fn set_now_playing(&self, np: NowPlayingConfig) -> Result<()> {
        let mut cfg = self.inner.lock();
        cfg.now_playing = np;
        self.save_locked(&cfg)
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

    #[test]
    fn missing_device_fields_default_to_none() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, r#"{"musicPaths": ["/a"]}"#).unwrap();
        let cfg = Config::open(dir.path()).unwrap();
        assert!(cfg.get_main_device().is_none());
        assert!(cfg.get_cue_device().is_none());
    }

    #[test]
    fn now_playing_defaults_when_missing() {
        let dir = tempdir().unwrap();
        let cfg = Config::open(dir.path()).unwrap();
        let np = cfg.get_now_playing();
        assert_eq!(np, NowPlayingConfig::default());
        assert!(np.file_enabled);
        assert!(np.webhook_enabled);
        assert!(np.webhook_url.is_none());
    }

    #[test]
    fn now_playing_round_trips_to_disk() {
        let dir = tempdir().unwrap();
        let cfg = Config::open(dir.path()).unwrap();
        let np = NowPlayingConfig {
            webhook_url: Some("https://example.com/hook".into()),
            webhook_secret: Some("s3cret".into()),
            file_dir: Some("/tmp/np".into()),
            file_enabled: false,
            webhook_enabled: true,
        };
        cfg.set_now_playing(np.clone()).unwrap();

        drop(cfg);
        let cfg2 = Config::open(dir.path()).unwrap();
        assert_eq!(cfg2.get_now_playing(), np);
    }

    #[test]
    fn now_playing_partial_json_fills_defaults() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(
            &path,
            r#"{"nowPlaying":{"webhookUrl":"https://x"}}"#,
        )
        .unwrap();
        let cfg = Config::open(dir.path()).unwrap();
        let np = cfg.get_now_playing();
        assert_eq!(np.webhook_url.as_deref(), Some("https://x"));
        assert!(np.file_enabled);
        assert!(np.webhook_enabled);
    }

    #[test]
    fn device_set_get_round_trips_to_disk() {
        let dir = tempdir().unwrap();
        let cfg = Config::open(dir.path()).unwrap();
        let device = DeviceRef {
            name: "hw:USB,0".to_string(),
            description: "Headphones".to_string(),
        };
        cfg.set_main_device(Some(device.clone())).unwrap();
        cfg.set_cue_device(Some(device.clone())).unwrap();

        drop(cfg);
        let cfg2 = Config::open(dir.path()).unwrap();
        assert_eq!(cfg2.get_main_device(), Some(device.clone()));
        assert_eq!(cfg2.get_cue_device(), Some(device));

        cfg2.set_main_device(None).unwrap();
        assert!(cfg2.get_main_device().is_none());
    }
}
