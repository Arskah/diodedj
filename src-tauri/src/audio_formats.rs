#![allow(dead_code)]

pub const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "wav", "ogg", "oga", "aac", "m4a", "wma", "opus", "webm", "aiff", "aif", "mka",
    "mp2",
];

pub fn is_audio_extension(ext: &str) -> bool {
    let lower = ext.to_ascii_lowercase();
    AUDIO_EXTENSIONS.iter().any(|e| *e == lower)
}

pub fn mime_for(format: &str) -> &'static str {
    match format.to_ascii_lowercase().as_str() {
        "mp3" | "mp2" => "audio/mpeg",
        "m4a" | "mp4" => "audio/mp4; codecs=\"mp4a.40.2\"",
        "aac" => "audio/aac",
        "ogg" | "oga" | "opus" => "audio/ogg",
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        "webm" => "audio/webm",
        "mka" => "audio/x-matroska",
        _ => "application/octet-stream",
    }
}

pub fn is_native_format(format: &str) -> bool {
    matches!(
        format.to_ascii_lowercase().as_str(),
        "mp3" | "wav" | "flac" | "ogg" | "oga" | "opus" | "aac" | "webm"
    )
}
