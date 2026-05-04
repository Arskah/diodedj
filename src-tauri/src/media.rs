use std::path::PathBuf;
use tauri::http::{header, Request, Response, StatusCode};

use crate::audio_formats::mime_for;
use crate::db::Db;
use crate::transcode;

pub fn handle(db: &Db, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let path = request.uri().path();
    let id_str = path.trim_start_matches('/');
    let id: i64 = match id_str.parse() {
        Ok(v) => v,
        Err(_) => return error(StatusCode::NOT_FOUND, "invalid id"),
    };
    let track = match db.get_media_track(id) {
        Ok(Some(t)) => t,
        Ok(None) => return error(StatusCode::NOT_FOUND, "track not found"),
        Err(e) => return error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    };

    let file_path = PathBuf::from(&track.path);
    let transcoding = transcode::should_transcode(&track.format, &file_path);

    if transcoding && track.duration <= 0.0 {
        return match transcode::transcode_full(&file_path) {
            Ok(body) => Response::builder()
                .header(header::CONTENT_TYPE, "audio/wav")
                .body(body)
                .unwrap(),
            Err(e) => error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
        };
    }

    let total: u64 = if transcoding {
        transcode::transcoded_total_size(track.duration)
    } else {
        match std::fs::metadata(&file_path) {
            Ok(m) => m.len(),
            Err(e) => return error(StatusCode::NOT_FOUND, &e.to_string()),
        }
    };
    if total == 0 {
        return error(StatusCode::INTERNAL_SERVER_ERROR, "empty file");
    }
    let content_type = if transcoding {
        "audio/wav".to_string()
    } else {
        mime_for(&track.format).to_string()
    };

    let range_hdr = request
        .headers()
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok());
    let (start, end, status) = if let Some(r) = range_hdr {
        match parse_range(r, total) {
            Some((s, e)) => (s, e, StatusCode::PARTIAL_CONTENT),
            None => {
                return Response::builder()
                    .status(StatusCode::RANGE_NOT_SATISFIABLE)
                    .header(header::CONTENT_RANGE, format!("bytes */{}", total))
                    .body(Vec::new())
                    .unwrap();
            }
        }
    } else {
        (0u64, total - 1, StatusCode::OK)
    };

    let body: Vec<u8> = if transcoding {
        match transcode::transcode_range(&file_path, track.duration, start, end) {
            Ok(b) => b,
            Err(e) => return error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
        }
    } else {
        match transcode::read_file_range(&file_path, start, end) {
            Ok(b) => b,
            Err(e) => return error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
        }
    };

    let length = body.len();
    let mut builder = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, length.to_string());
    if status == StatusCode::PARTIAL_CONTENT {
        builder = builder.header(
            header::CONTENT_RANGE,
            format!("bytes {}-{}/{}", start, end, total),
        );
    }
    builder.body(body).unwrap()
}

fn parse_range(s: &str, total: u64) -> Option<(u64, u64)> {
    let s = s.strip_prefix("bytes=")?;
    let mut parts = s.splitn(2, '-');
    let start: u64 = parts.next()?.parse().ok()?;
    let end_str = parts.next()?;
    let end: u64 = if end_str.is_empty() {
        total - 1
    } else {
        end_str.parse().ok()?
    };
    let end = end.min(total - 1);
    if start > end {
        return None;
    }
    Some((start, end))
}

fn error(status: StatusCode, msg: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .body(msg.as_bytes().to_vec())
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_range_basic() {
        assert_eq!(parse_range("bytes=0-99", 1000), Some((0, 99)));
    }

    #[test]
    fn parse_range_open_end_clamps_to_total_minus_one() {
        assert_eq!(parse_range("bytes=500-", 1000), Some((500, 999)));
    }

    #[test]
    fn parse_range_clamps_overshoot() {
        assert_eq!(parse_range("bytes=0-9999", 1000), Some((0, 999)));
    }

    #[test]
    fn parse_range_rejects_inverted() {
        assert_eq!(parse_range("bytes=900-100", 1000), None);
    }

    #[test]
    fn parse_range_rejects_garbage() {
        assert_eq!(parse_range("xyz", 1000), None);
        assert_eq!(parse_range("bytes=abc-", 1000), None);
    }
}
