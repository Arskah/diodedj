use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::Arc;
use tauri::{Manager, State};

mod config;
mod db;
mod playlist;
mod session;

use config::Config;
use db::{Db, LibraryStats, Track};
use session::{Session, SessionState};

pub struct AppState {
    db: Arc<Db>,
    config: Arc<Config>,
    session: Arc<Session>,
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
fn get_tracks_by_ids(
    state: State<'_, AppState>,
    ids: Vec<i64>,
) -> Result<Vec<Track>, String> {
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
fn get_all_paths(state: State<'_, AppState>) -> Value {
    state.config.get_all_paths()
}

#[tauri::command(rename_all = "camelCase")]
fn add_path(
    state: State<'_, AppState>,
    r#type: String,
    dir_path: String,
) -> Result<bool, String> {
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
    for id in s
        .playlist_ids
        .iter()
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
fn pick_filler(
    app: State<'_, AppState>,
    content_type: String,
) -> Result<Option<Track>, String> {
    playlist::pick_filler(&app.db, &content_type).map_err(err)
}

#[tauri::command(rename_all = "camelCase")]
async fn scan_library() -> Value {
    json!({ "alreadyRunning": false })
}

#[tauri::command(rename_all = "camelCase")]
async fn cancel_scan() {}

#[tauri::command(rename_all = "camelCase")]
async fn get_scan_status() -> Value {
    json!({ "status": "idle", "lastResult": null })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db = Db::open(&data_dir.join("diodedj.db"))?;
            let config = Config::open(&data_dir)?;
            let session = Session::open(&data_dir);
            app.manage(AppState {
                db: Arc::new(db),
                config: Arc::new(config),
                session: Arc::new(session),
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
