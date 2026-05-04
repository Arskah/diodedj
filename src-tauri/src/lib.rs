use serde::Serialize;
use std::collections::HashSet;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

mod audio_formats;
mod config;
mod db;
mod media;
mod playlist;
mod scan_state;
mod scanner;
mod session;
mod transcode;

use config::Config;
use db::{Db, LibraryStats, Track};
use scan_state::{ScanState, ScanStatus, StartResult};
use session::{Session, SessionState};

pub struct AppState {
    db: Arc<Db>,
    config: Arc<Config>,
    session: Arc<Session>,
    scan: Arc<ScanState>,
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
fn get_all_paths(state: State<'_, AppState>) -> serde_json::Value {
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
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol("media", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            std::thread::spawn(move || {
                let state = app.state::<AppState>();
                let response = media::handle(&state.db, &request);
                responder.respond(response);
            });
        })
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
                scan: Arc::new(ScanState::default()),
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
