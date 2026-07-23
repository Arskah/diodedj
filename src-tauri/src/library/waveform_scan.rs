//! Background waveform computation, decoupled from the metadata scan.
//!
//! The metadata scan (tag reads) is fast and finishes quickly. Computing a
//! track's amplitude curve requires a full audio decode, which is far heavier —
//! so it runs here, on its own worker thread, after the scan. Waveforms land in
//! the DB one at a time and a `waveform-ready` event is emitted per track so the
//! renderer can refresh a curve for the deck that is currently showing it.
//!
//! Progress is surfaced separately from the metadata scan via
//! `waveform-progress` / `waveform-state-changed` so the UI can show a second
//! bar under the tag-scan bar. Like the metadata scan, the `processed`/`total`
//! counts are cumulative across all libraries (the worker drains one flat
//! missing-waveform list spanning every library).
//!
//! The job is single-flight (only one worker at a time) and cancelable. It
//! drains [`Db::tracks_missing_waveform`] in a loop so tracks added while it runs
//! are still picked up; ids that fail to decode are remembered for the run so a
//! permanently-undecodable file never causes an infinite retry loop.

use parking_lot::Mutex;
use serde::Serialize;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use super::db::Db;
use crate::audio::waveform;

/// Event emitted after a track's waveform is stored. Payload is the track id.
const WAVEFORM_READY_EVENT: &str = "waveform-ready";
/// Throttled `{processed, total}` progress updates.
const WAVEFORM_PROGRESS_EVENT: &str = "waveform-progress";
/// Running/idle transitions.
const WAVEFORM_STATE_EVENT: &str = "waveform-state-changed";
const PROGRESS_THROTTLE: Duration = Duration::from_millis(200);

/// Progress of the background waveform pass, mirrored to the UI. Cumulative
/// across all libraries.
#[derive(Serialize, Clone, Default, PartialEq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum WaveformStatus {
    #[default]
    Idle,
    #[serde(rename_all = "camelCase")]
    Running { processed: usize, total: usize },
}

#[derive(Serialize, Clone)]
struct WaveformProgress {
    processed: usize,
    total: usize,
}

#[derive(Default)]
pub struct WaveformJob {
    running: AtomicBool,
    cancel: AtomicBool,
    status: Mutex<WaveformStatus>,
}

impl WaveformJob {
    /// Current progress, for hydration when the UI mounts mid-run.
    pub fn status(&self) -> WaveformStatus {
        self.status.lock().clone()
    }

    /// Request the running worker (if any) to stop after the current file.
    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    /// Kick the worker. No-op if one is already running (single-flight): the
    /// running worker re-drains the work list on each pass, so it will observe
    /// any tracks a concurrent scan just added.
    pub fn start(self: Arc<Self>, app: AppHandle, db: Arc<Db>) {
        // Claim the single-flight slot; bail if a worker already holds it.
        if self.running.swap(true, Ordering::SeqCst) {
            return;
        }
        self.cancel.store(false, Ordering::SeqCst);
        std::thread::spawn(move || {
            run(&self, &app, &db);
            self.running.store(false, Ordering::SeqCst);
        });
    }

    fn set_status(&self, app: &AppHandle, next: WaveformStatus) {
        *self.status.lock() = next.clone();
        let _ = app.emit(WAVEFORM_STATE_EVENT, &next);
    }
}

fn run(job: &WaveformJob, app: &AppHandle, db: &Db) {
    // Ids that failed to decode this run — skipped on subsequent passes so a
    // permanently-broken file cannot wedge the drain loop.
    let mut failed: HashSet<i64> = HashSet::new();
    let mut processed = 0usize;
    let mut started = false;
    let mut last_emit = Instant::now()
        .checked_sub(PROGRESS_THROTTLE)
        .unwrap_or_else(Instant::now);

    loop {
        if job.cancel.load(Ordering::SeqCst) {
            break;
        }
        let missing = match db.tracks_missing_waveform() {
            Ok(m) => m,
            Err(e) => {
                log::error!("waveform: query missing failed: {}", e);
                break;
            }
        };
        let pending: Vec<(i64, String, Option<f64>)> = missing
            .into_iter()
            .filter(|(id, _, _)| !failed.contains(id))
            .collect();
        if pending.is_empty() {
            break;
        }

        // Announce Running only once real work exists — avoids a bar flash when
        // every track already has a waveform.
        if !started {
            started = true;
            job.set_status(
                app,
                WaveformStatus::Running {
                    processed: 0,
                    total: pending.len(),
                },
            );
        }

        // Total for this pass. It can grow across passes if a concurrent scan
        // adds tracks; `processed` only ever climbs.
        let total = processed + pending.len();
        for (id, path, duration) in pending {
            if job.cancel.load(Ordering::SeqCst) {
                break;
            }
            match compute(&path, duration) {
                Some(peaks) => {
                    if let Err(e) = db.set_waveform(id, &peaks) {
                        log::error!("waveform: store {} failed: {}", id, e);
                        failed.insert(id);
                    } else {
                        let _ = app.emit(WAVEFORM_READY_EVENT, id);
                    }
                }
                None => {
                    failed.insert(id);
                }
            }
            processed += 1;
            *job.status.lock() = WaveformStatus::Running { processed, total };
            if last_emit.elapsed() >= PROGRESS_THROTTLE {
                last_emit = Instant::now();
                let _ = app.emit(
                    WAVEFORM_PROGRESS_EVENT,
                    WaveformProgress { processed, total },
                );
            }
        }
    }

    if started {
        job.set_status(app, WaveformStatus::Idle);
    }
}

/// Read and decode a file into its peak curve. Returns `None` (logged) on any
/// read/decode failure so a single bad file never stops the worker.
fn compute(path: &str, duration: Option<f64>) -> Option<Vec<u8>> {
    let bytes = match std::fs::read(path) {
        Ok(v) => Arc::from(v.into_boxed_slice()),
        Err(e) => {
            log::warn!("waveform: read {} failed: {}", path, e);
            return None;
        }
    };
    let hint = duration.filter(|d| *d > 0.0);
    match waveform::compute_peaks(bytes, hint) {
        Ok(peaks) => Some(peaks),
        Err(e) => {
            log::warn!("waveform: decode {} failed: {}", path, e);
            None
        }
    }
}
