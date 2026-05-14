use parking_lot::Mutex;
use serde::Serialize;
use std::collections::HashSet;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

mod audio;
mod library;
mod persist;
mod playlist;

use audio::devices::{list_output_devices, resolve_device, resolve_main_device, DeviceInfo};
use audio::player::{Cmd, PlayerHandle};
use library::db::{Db, LibraryStats, Track};
use library::scan_state::{ScanState, ScanStatus, StartResult};
use persist::config::{Config, DeviceRef};
use persist::session::{PlaylistItem, Session, SessionState};

pub struct AppState {
    db: Arc<Db>,
    config: Arc<Config>,
    session: Arc<Session>,
    scan: Arc<ScanState>,
    player: Arc<PlayerHandle>,
    cue: Arc<Mutex<Option<PlayerHandle>>>,
    app_handle: AppHandle,
}

#[derive(Serialize)]
struct SessionLoadResult {
    state: SessionState,
    tracks: Vec<Track>,
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[tauri::command(rename_all = "camelCase")]
fn search(
    state: State<'_, AppState>,
    query: String,
    content_type: Option<String>,
    sort_by: Option<String>,
    sort_dir: Option<String>,
) -> Result<Vec<Track>, String> {
    state
        .db
        .search(
            &query,
            content_type.as_deref(),
            sort_by.as_deref(),
            sort_dir.as_deref(),
        )
        .map_err(err)
}

#[tauri::command(rename_all = "camelCase")]
fn get_track(state: State<'_, AppState>, id: i64) -> Result<Option<Track>, String> {
    state.db.get_track(id).map_err(err)
}

#[tauri::command(rename_all = "camelCase")]
fn get_tracks_by_ids(state: State<'_, AppState>, ids: Vec<i64>) -> Result<Vec<Track>, String> {
    state.db.get_tracks_by_ids(&ids).map_err(err)
}

#[tauri::command(rename_all = "camelCase")]
fn get_stats(state: State<'_, AppState>) -> Result<LibraryStats, String> {
    state.db.get_stats().map_err(err)
}

#[tauri::command(rename_all = "camelCase")]
fn track_played(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    state.db.increment_play_count(id).map_err(err)
}

#[tauri::command(rename_all = "camelCase")]
fn get_paths(state: State<'_, AppState>, r#type: String) -> Vec<String> {
    state.config.get_paths(&r#type)
}

#[tauri::command(rename_all = "camelCase")]
fn get_all_paths(state: State<'_, AppState>) -> serde_json::Value {
    state.config.get_all_paths()
}

#[tauri::command(rename_all = "camelCase")]
fn add_path(state: State<'_, AppState>, r#type: String, dir_path: String) -> Result<bool, String> {
    state.config.add_path(&r#type, &dir_path).map_err(err)
}

#[tauri::command(rename_all = "camelCase")]
fn remove_path(
    state: State<'_, AppState>,
    r#type: String,
    dir_path: String,
) -> Result<bool, String> {
    state.config.remove_path(&r#type, &dir_path).map_err(err)
}

#[tauri::command(rename_all = "camelCase")]
fn load_session(app: State<'_, AppState>) -> Result<SessionLoadResult, String> {
    let s = app.session.load();
    let mut ids: Vec<i64> = Vec::new();
    let mut seen: HashSet<i64> = HashSet::new();
    let item_ids = s.playlist_items.iter().filter_map(|item| match item {
        PlaylistItem::Track { id } => Some(id),
        PlaylistItem::Stop => None,
    });
    for id in s
        .playlist_ids
        .iter()
        .chain(item_ids)
        .chain(s.history_ids.iter())
        .chain(s.current_track_id.iter())
    {
        if seen.insert(*id) {
            ids.push(*id);
        }
    }
    let tracks = app.db.get_tracks_by_ids(&ids).map_err(err)?;
    Ok(SessionLoadResult { state: s, tracks })
}

#[tauri::command(rename_all = "camelCase")]
fn save_session(app: State<'_, AppState>, state: SessionState) -> Result<(), String> {
    app.session.save(state).map_err(err)
}

#[tauri::command(rename_all = "camelCase")]
fn generate_playlist(app: State<'_, AppState>, count: i64) -> Result<Vec<Track>, String> {
    playlist::generate(&app.db, count).map_err(err)
}

#[tauri::command(rename_all = "camelCase")]
fn pick_filler(app: State<'_, AppState>, content_type: String) -> Result<Option<Track>, String> {
    playlist::pick_filler(&app.db, &content_type).map_err(err)
}

#[tauri::command(rename_all = "camelCase")]
fn player_load(app_state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let track = app_state
        .db
        .get_media_track(id)
        .map_err(err)?
        .ok_or_else(|| "track not found".to_string())?;
    app_state.player.send(Cmd::Load {
        path: std::path::PathBuf::from(track.path),
        duration: if track.duration > 0.0 {
            Some(track.duration)
        } else {
            None
        },
    });
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
fn player_play(app_state: State<'_, AppState>) {
    app_state.player.send(Cmd::Play);
}

#[tauri::command(rename_all = "camelCase")]
fn player_pause(app_state: State<'_, AppState>) {
    app_state.player.send(Cmd::Pause);
}

#[tauri::command(rename_all = "camelCase")]
fn player_stop(app_state: State<'_, AppState>) {
    app_state.player.send(Cmd::Stop);
}

#[tauri::command(rename_all = "camelCase")]
fn player_seek(app_state: State<'_, AppState>, seconds: f64) {
    app_state.player.send(Cmd::Seek(seconds));
}

#[tauri::command(rename_all = "camelCase")]
fn player_set_volume(app_state: State<'_, AppState>, volume: f32) {
    app_state.player.send(Cmd::SetVolume(volume));
}

#[tauri::command(rename_all = "camelCase")]
fn audio_list_devices() -> Vec<DeviceInfo> {
    list_output_devices()
}

#[tauri::command(rename_all = "camelCase")]
fn get_main_device(state: State<'_, AppState>) -> Option<DeviceRef> {
    state.config.get_main_device()
}

#[tauri::command(rename_all = "camelCase")]
fn set_main_device(state: State<'_, AppState>, device: Option<DeviceRef>) -> Result<(), String> {
    state.config.set_main_device(device).map_err(err)?;
    log::info!("main device updated; restart required to apply");
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
fn get_cue_device(state: State<'_, AppState>) -> Option<DeviceRef> {
    state.config.get_cue_device()
}

#[tauri::command(rename_all = "camelCase")]
fn set_cue_device(state: State<'_, AppState>, device: Option<DeviceRef>) -> Result<(), String> {
    state.config.set_cue_device(device).map_err(err)?;
    // Invalidate cached cue handle so the next cue_* command spawns
    // against the new device. Dropping the Sender stops the worker thread.
    *state.cue.lock() = None;
    Ok(())
}

/// Ensure a cue `PlayerHandle` exists for the configured cue device.
/// Lazy-spawned on first cue command. Errors if no cue device is set
/// or the saved device cannot be resolved.
fn with_cue<F>(state: &State<'_, AppState>, f: F) -> Result<(), String>
where
    F: FnOnce(&PlayerHandle),
{
    let mut guard = state.cue.lock();
    if guard.is_none() {
        let cue_ref = state
            .config
            .get_cue_device()
            .ok_or_else(|| "no cue device configured; pick one in Settings → Audio".to_string())?;
        let device = resolve_device(&cue_ref).ok_or_else(|| {
            format!(
                "cue device '{}' not found among current outputs",
                cue_ref.description
            )
        })?;
        *guard = Some(PlayerHandle::spawn(
            state.app_handle.clone(),
            Some(device),
            "cue",
        ));
    }
    if let Some(handle) = guard.as_ref() {
        f(handle);
    }
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
fn cue_load(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let track = state
        .db
        .get_media_track(id)
        .map_err(err)?
        .ok_or_else(|| "track not found".to_string())?;
    with_cue(&state, |h| {
        h.send(Cmd::Load {
            path: std::path::PathBuf::from(track.path),
            duration: if track.duration > 0.0 {
                Some(track.duration)
            } else {
                None
            },
        });
    })
}

#[tauri::command(rename_all = "camelCase")]
fn cue_play(state: State<'_, AppState>) -> Result<(), String> {
    with_cue(&state, |h| h.send(Cmd::Play))
}

#[tauri::command(rename_all = "camelCase")]
fn cue_pause(state: State<'_, AppState>) -> Result<(), String> {
    with_cue(&state, |h| h.send(Cmd::Pause))
}

#[tauri::command(rename_all = "camelCase")]
fn cue_stop(state: State<'_, AppState>) -> Result<(), String> {
    with_cue(&state, |h| h.send(Cmd::Stop))
}

#[tauri::command(rename_all = "camelCase")]
fn cue_seek(state: State<'_, AppState>, seconds: f64) -> Result<(), String> {
    with_cue(&state, |h| h.send(Cmd::Seek(seconds)))
}

#[tauri::command(rename_all = "camelCase")]
fn cue_set_volume(state: State<'_, AppState>, volume: f32) -> Result<(), String> {
    with_cue(&state, |h| h.send(Cmd::SetVolume(volume)))
}

#[tauri::command(rename_all = "camelCase")]
fn scan_library(app: AppHandle, state: State<'_, AppState>) -> StartResult {
    Arc::clone(&state.scan).start(app, Arc::clone(&state.db), Arc::clone(&state.config))
}

#[tauri::command(rename_all = "camelCase")]
fn cancel_scan(state: State<'_, AppState>) {
    state.scan.cancel();
}

#[tauri::command(rename_all = "camelCase")]
fn get_scan_status(state: State<'_, AppState>) -> ScanStatus {
    state.scan.status()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let log_level = std::env::var("RUST_LOG")
        .ok()
        .and_then(|s| s.parse::<log::LevelFilter>().ok())
        .unwrap_or(if cfg!(debug_assertions) {
            log::LevelFilter::Debug
        } else {
            log::LevelFilter::Info
        });

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: None,
                    }),
                ])
                .level(log_level)
                .level_for("symphonia", log::LevelFilter::Warn)
                .level_for("symphonia_core", log::LevelFilter::Warn)
                .level_for("symphonia_bundle_mp3", log::LevelFilter::Warn)
                .max_file_size(1024 * 1024)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .build(),
        )
        .setup(|app| {
            std::panic::set_hook(Box::new(|info| {
                let bt = std::backtrace::Backtrace::force_capture();
                log::error!("panic: {}\n{}", info, bt);
            }));
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db = Db::open(&data_dir.join("diodedj.db"))?;
            let config = Config::open(&data_dir)?;
            let session = Session::open(&data_dir);
            let main_device = resolve_main_device(config.get_main_device().as_ref());
            let player = PlayerHandle::spawn(app.handle().clone(), main_device, "player");
            app.manage(AppState {
                db: Arc::new(db),
                config: Arc::new(config),
                session: Arc::new(session),
                scan: Arc::new(ScanState::default()),
                player: Arc::new(player),
                cue: Arc::new(Mutex::new(None)),
                app_handle: app.handle().clone(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search,
            get_track,
            get_tracks_by_ids,
            load_session,
            save_session,
            track_played,
            generate_playlist,
            pick_filler,
            get_stats,
            get_paths,
            get_all_paths,
            add_path,
            remove_path,
            scan_library,
            cancel_scan,
            get_scan_status,
            audio_list_devices,
            get_main_device,
            set_main_device,
            get_cue_device,
            set_cue_device,
            cue_load,
            cue_play,
            cue_pause,
            cue_stop,
            cue_seek,
            cue_set_volume,
            player_load,
            player_play,
            player_pause,
            player_stop,
            player_seek,
            player_set_volume,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
