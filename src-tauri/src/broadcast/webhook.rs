use std::time::Duration;

use anyhow::Result;
use hmac::{Hmac, KeyInit, Mac};
use reqwest::{header, Client};
use sha2::Sha256;

use super::payload::{Payload, TestPayload};

const TIMEOUT: Duration = Duration::from_secs(5);
const USER_AGENT: &str = concat!("Radiodiodj/", env!("CARGO_PKG_VERSION"));
pub const SIGNATURE_HEADER: &str = "X-Radiodiodj-Signature";

pub struct Webhook {
    client: Client,
}

impl Webhook {
    pub fn new() -> Result<Self> {
        let client = Client::builder()
            .timeout(TIMEOUT)
            .user_agent(USER_AGENT)
            .build()?;
        Ok(Self { client })
    }

    pub async fn send(
        &self,
        url: &str,
        secret: Option<&str>,
        payload: &Payload,
    ) -> Result<reqwest::StatusCode> {
        let body = payload.to_json_bytes()?;
        self.post(url, secret, body).await
    }

    pub async fn send_test(
        &self,
        url: &str,
        secret: Option<&str>,
        payload: &TestPayload,
    ) -> Result<reqwest::StatusCode> {
        let body = serde_json::to_vec(payload)?;
        self.post(url, secret, body).await
    }

    async fn post(
        &self,
        url: &str,
        secret: Option<&str>,
        body: Vec<u8>,
    ) -> Result<reqwest::StatusCode> {
        let mut req = self
            .client
            .post(url)
            .header(header::CONTENT_TYPE, "application/json")
            .body(body.clone());

        if let Some(secret) = secret.filter(|s| !s.is_empty()) {
            req = req.header(SIGNATURE_HEADER, format!("sha256={}", sign(secret, &body)));
        }

        let resp = req.send().await?;
        Ok(resp.status())
    }
}

pub fn sign(secret: &str, body: &[u8]) -> String {
    let mut mac =
        <Hmac<Sha256>>::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(body);
    hex_lower(&mac.finalize().into_bytes())
}

fn hex_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::broadcast::payload::{test_payload, BroadcastTrack};
    use chrono::DateTime;
    use wiremock::matchers::{header, header_exists, method, path};
    use wiremock::{Mock, MockServer, Request, ResponseTemplate};

    fn track() -> BroadcastTrack {
        BroadcastTrack {
            id: 1,
            title: "Song".into(),
            artist: "Artist".into(),
            album: "Album".into(),
            genre: None,
            duration_sec: 100.0,
            content_type: "music".into(),
            path: "/p/song.mp3".into(),
        }
    }

    fn ts() -> DateTime<chrono::Utc> {
        "2026-05-19T00:00:00Z".parse().unwrap()
    }

    #[test]
    fn hmac_sign_is_deterministic_lowercase_hex() {
        // Regression guard: HMAC-SHA256("hello", b"hi"), lowercase hex.
        let sig = sign("hello", b"hi");
        assert_eq!(
            sig,
            "42eb9553cf9288e53d3389208d00db1ac80d3666f1fa74fe02e1038672d0c83a"
        );
        assert_eq!(sig.len(), 64);
        assert!(sig
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
    }

    #[test]
    fn hmac_sign_differs_for_different_secrets_and_bodies() {
        assert_ne!(sign("a", b"x"), sign("b", b"x"));
        assert_ne!(sign("a", b"x"), sign("a", b"y"));
    }

    #[tokio::test]
    async fn posts_json_with_content_type() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/hook"))
            .and(header("content-type", "application/json"))
            .respond_with(ResponseTemplate::new(204))
            .mount(&server)
            .await;

        let wh = Webhook::new().unwrap();
        let status = wh
            .send(
                &format!("{}/hook", server.uri()),
                None,
                &Payload::now_playing(track(), ts()),
            )
            .await
            .unwrap();
        assert_eq!(status.as_u16(), 204);
    }

    #[tokio::test]
    async fn includes_signature_header_when_secret_set() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/hook"))
            .and(header_exists(SIGNATURE_HEADER))
            .respond_with(ResponseTemplate::new(200))
            .mount(&server)
            .await;

        let wh = Webhook::new().unwrap();
        let status = wh
            .send(
                &format!("{}/hook", server.uri()),
                Some("topsecret"),
                &Payload::now_playing(track(), ts()),
            )
            .await
            .unwrap();
        assert_eq!(status.as_u16(), 200);
    }

    #[tokio::test]
    async fn signature_matches_hmac_of_body() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/hook"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&server)
            .await;

        let wh = Webhook::new().unwrap();
        wh.send(
            &format!("{}/hook", server.uri()),
            Some("topsecret"),
            &Payload::stopped(ts()),
        )
        .await
        .unwrap();

        let reqs: Vec<Request> = server.received_requests().await.expect("requests recorded");
        let req = reqs.first().expect("one request");
        let sig_header = req
            .headers
            .get(SIGNATURE_HEADER)
            .expect("signature header")
            .to_str()
            .unwrap();
        let expected = format!("sha256={}", sign("topsecret", &req.body));
        assert_eq!(sig_header, expected);
    }

    #[tokio::test]
    async fn empty_secret_treated_as_no_secret() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/hook"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&server)
            .await;

        let wh = Webhook::new().unwrap();
        wh.send(
            &format!("{}/hook", server.uri()),
            Some(""),
            &Payload::stopped(ts()),
        )
        .await
        .unwrap();

        let reqs = server.received_requests().await.unwrap();
        assert!(reqs[0].headers.get(SIGNATURE_HEADER).is_none());
    }

    #[tokio::test]
    async fn test_payload_sends_test_event() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/hook"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&server)
            .await;

        let wh = Webhook::new().unwrap();
        wh.send_test(&format!("{}/hook", server.uri()), None, &test_payload(ts()))
            .await
            .unwrap();

        let reqs = server.received_requests().await.unwrap();
        let body = String::from_utf8(reqs[0].body.clone()).unwrap();
        assert!(body.contains("\"event\":\"test\""));
    }
}
