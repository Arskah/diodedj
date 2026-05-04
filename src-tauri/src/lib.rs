use serde_json::{json, Value};

#[tauri::command(rename_all = "camelCase")]
async fn search(
    query: String,
    content_type: Option<String>,
    sort_by: Option<String>,
    sort_dir: Option<String>,
) -> Vec<Value> {
    let _ = (query, content_type, sort_by, sort_dir);
    vec![]
}

#[tauri::command(rename_all = "camelCase")]
async fn get_track(id: i64) -> Option<Value> {
    let _ = id;
    None
}

#[tauri::command(rename_all = "camelCase")]
async fn get_tracks_by_ids(ids: Vec<i64>) -> Vec<Value> {
    let _ = ids;
    vec![]
}

#[tauri::command(rename_all = "camelCase")]
async fn load_session() -> Value {
    json!({
        "state": {
            "playlistIds": [],
            "historyIds": [],
            "currentTrackId": null,
            "currentTime": 0,
            "autoPlaylistActive": false,
            "autoAdvance": true,
            "volume": 1
        },
        "tracks": []
    })
}

#[tauri::command(rename_all = "camelCase")]
async fn save_session(state: Value) {
    let _ = state;
}

#[tauri::command(rename_all = "camelCase")]
async fn track_played(id: i64) {
    let _ = id;
}

#[tauri::command(rename_all = "camelCase")]
async fn generate_playlist(count: i64) -> Vec<Value> {
    let _ = count;
    vec![]
}

#[tauri::command(rename_all = "camelCase")]
async fn pick_filler(content_type: String) -> Option<Value> {
    let _ = content_type;
    None
}

#[tauri::command(rename_all = "camelCase")]
async fn get_stats() -> Value {
    json!({
        "totalTracks": 0,
        "totalArtists": 0,
        "totalAlbums": 0,
        "totalHours": 0,
        "tracksByType": { "music": 0, "commercial": 0, "jingle": 0 }
    })
}

#[tauri::command(rename_all = "camelCase")]
async fn get_paths(r#type: String) -> Vec<String> {
    let _ = r#type;
    vec![]
}

#[tauri::command(rename_all = "camelCase")]
async fn get_all_paths() -> Value {
    json!({ "music": [], "commercial": [], "jingle": [] })
}

#[tauri::command(rename_all = "camelCase")]
async fn add_path(r#type: String) -> Option<String> {
    let _ = r#type;
    None
}

#[tauri::command(rename_all = "camelCase")]
async fn remove_path(r#type: String, dir_path: String) -> bool {
    let _ = (r#type, dir_path);
    true
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
