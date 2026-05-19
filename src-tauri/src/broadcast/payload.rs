use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastTrack {
    pub id: i64,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub genre: Option<String>,
    pub duration_sec: f64,
    pub content_type: String,
    pub path: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NowPlayingPayload {
    pub event: &'static str,
    pub track: BroadcastTrack,
    pub started_at: DateTime<Utc>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoppedPayload {
    pub event: &'static str,
    pub stopped_at: DateTime<Utc>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TestPayload {
    pub event: &'static str,
    pub sent_at: DateTime<Utc>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Payload {
    NowPlaying(NowPlayingPayload),
    Stopped(StoppedPayload),
}

impl Payload {
    pub fn now_playing(track: BroadcastTrack, started_at: DateTime<Utc>) -> Self {
        Self::NowPlaying(NowPlayingPayload {
            event: "now_playing",
            track,
            started_at,
        })
    }

    pub fn stopped(stopped_at: DateTime<Utc>) -> Self {
        Self::Stopped(StoppedPayload {
            event: "stopped",
            stopped_at,
        })
    }

    pub fn to_json_bytes(&self) -> serde_json::Result<Vec<u8>> {
        match self {
            Self::NowPlaying(p) => serde_json::to_vec(p),
            Self::Stopped(p) => serde_json::to_vec(p),
        }
    }

    #[cfg(test)]
    pub fn to_json_pretty(&self) -> serde_json::Result<String> {
        match self {
            Self::NowPlaying(p) => serde_json::to_string_pretty(p),
            Self::Stopped(p) => serde_json::to_string_pretty(p),
        }
    }
}

pub fn test_payload(now: DateTime<Utc>) -> TestPayload {
    TestPayload {
        event: "test",
        sent_at: now,
    }
}

pub fn track_text_line(track: &BroadcastTrack) -> String {
    let title = track.title.trim();
    let artist = track.artist.trim();
    if artist.is_empty() {
        title.to_string()
    } else {
        format!("{} - {}", artist, title)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_track() -> BroadcastTrack {
        BroadcastTrack {
            id: 7,
            title: "Song".into(),
            artist: "Artist".into(),
            album: "Album".into(),
            genre: Some("Rock".into()),
            duration_sec: 245.3,
            content_type: "music".into(),
            path: "/abs/path/song.mp3".into(),
        }
    }

    #[test]
    fn now_playing_serializes_camel_case_with_event_discriminator() {
        let ts: DateTime<Utc> = "2026-05-19T14:23:11.482Z".parse().unwrap();
        let p = Payload::now_playing(sample_track(), ts);
        let s = p.to_json_pretty().unwrap();
        assert!(s.contains("\"event\": \"now_playing\""));
        assert!(s.contains("\"durationSec\": 245.3"));
        assert!(s.contains("\"contentType\": \"music\""));
        assert!(s.contains("\"startedAt\": \"2026-05-19T14:23:11.482Z\""));
        assert!(s.contains("\"path\": \"/abs/path/song.mp3\""));
    }

    #[test]
    fn stopped_serializes_with_event_discriminator() {
        let ts: DateTime<Utc> = "2026-05-19T14:27:16.901Z".parse().unwrap();
        let p = Payload::stopped(ts);
        let s = p.to_json_pretty().unwrap();
        assert!(s.contains("\"event\": \"stopped\""));
        assert!(s.contains("\"stoppedAt\": \"2026-05-19T14:27:16.901Z\""));
    }

    #[test]
    fn test_payload_uses_test_event() {
        let ts: DateTime<Utc> = "2026-05-19T00:00:00Z".parse().unwrap();
        let p = test_payload(ts);
        let s = serde_json::to_string(&p).unwrap();
        assert!(s.contains("\"event\":\"test\""));
        assert!(s.contains("\"sentAt\":\"2026-05-19T00:00:00Z\""));
    }

    #[test]
    fn track_text_line_uses_artist_dash_title() {
        let t = sample_track();
        assert_eq!(track_text_line(&t), "Artist - Song");
    }

    #[test]
    fn track_text_line_omits_dash_when_artist_empty() {
        let mut t = sample_track();
        t.artist = "".into();
        assert_eq!(track_text_line(&t), "Song");
    }

    #[test]
    fn track_text_line_trims_whitespace() {
        let mut t = sample_track();
        t.artist = "  ".into();
        assert_eq!(track_text_line(&t), "Song");
    }
}
