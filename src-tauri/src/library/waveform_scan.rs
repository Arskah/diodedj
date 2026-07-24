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
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
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
/// Hard ceiling on parallel decode workers. Decoding is CPU-heavy and each file
/// is independent, so we fan out across cores; the actual worker count is
/// `cores - 2` (reserving headroom for playback/UI) clamped into `2..=MAX`. This
/// ceiling keeps a huge-core machine — or a networked share — from being flooded
/// with concurrent reads.
const MAX_CONCURRENCY: usize = 8;
/// Cores held back from the decode pool so audio playback and the UI stay
/// responsive when a backfill runs mid-set.
const RESERVED_CORES: usize = 2;

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
    // permanently-broken file cannot wedge the drain loop. Shared across the
    // decode threads.
    let failed: Mutex<HashSet<i64>> = Mutex::new(HashSet::new());
    // Total files processed across all passes; drives the progress numerator.
    let processed = AtomicUsize::new(0);
    let last_emit = Mutex::new(
        Instant::now()
            .checked_sub(PROGRESS_THROTTLE)
            .unwrap_or_else(Instant::now),
    );
    // Balanced pool: use the cores that exist minus a reserve for playback/UI,
    // never fewer than 2, never more than the MAX_CONCURRENCY ceiling.
    let cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);
    let concurrency = cores
        .saturating_sub(RESERVED_CORES)
        .clamp(2, MAX_CONCURRENCY);
    let mut started = false;

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
        let pending: Vec<(i64, String, Option<f64>)> = {
            let f = failed.lock();
            missing
                .into_iter()
                .filter(|(id, _, _)| !f.contains(id))
                .collect()
        };
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
        let total = processed.load(Ordering::Relaxed) + pending.len();
        // Shared cursor into `pending`; each worker claims the next index.
        let next = AtomicUsize::new(0);
        std::thread::scope(|scope| {
            for _ in 0..concurrency {
                scope.spawn(|| loop {
                    if job.cancel.load(Ordering::SeqCst) {
                        break;
                    }
                    let i = next.fetch_add(1, Ordering::Relaxed);
                    let Some((id, path, _duration)) = pending.get(i) else {
                        break;
                    };
                    match compute(path) {
                        Some((peaks, decode_ms)) => {
                            let store_start = Instant::now();
                            if let Err(e) = db.set_waveform(*id, &peaks) {
                                log::error!("waveform: store {} failed: {}", id, e);
                                failed.lock().insert(*id);
                            } else {
                                log::debug!(
                                    "waveform: {} decode {}ms write {}ms",
                                    path,
                                    decode_ms,
                                    store_start.elapsed().as_millis()
                                );
                                let _ = app.emit(WAVEFORM_READY_EVENT, *id);
                            }
                        }
                        None => {
                            failed.lock().insert(*id);
                        }
                    }
                    let done = processed.fetch_add(1, Ordering::Relaxed) + 1;
                    *job.status.lock() = WaveformStatus::Running {
                        processed: done,
                        total,
                    };
                    let mut le = last_emit.lock();
                    if le.elapsed() >= PROGRESS_THROTTLE {
                        *le = Instant::now();
                        drop(le);
                        let _ = app.emit(
                            WAVEFORM_PROGRESS_EVENT,
                            WaveformProgress {
                                processed: done,
                                total,
                            },
                        );
                    }
                });
            }
        });
    }

    if started {
        job.set_status(app, WaveformStatus::Idle);
    }
}

/// Read and decode a file into its amplitude curve. Returns the curve plus the
/// read+decode duration in milliseconds (for the debug timing log), or `None`
/// (logged) on any read/decode failure so a single bad file never stops the
/// worker.
fn compute(path: &str) -> Option<(Vec<u8>, u128)> {
    let start = Instant::now();
    let bytes = match std::fs::read(path) {
        Ok(v) => Arc::from(v.into_boxed_slice()),
        Err(e) => {
            log::warn!("waveform: read {} failed: {}", path, e);
            return None;
        }
    };
    match waveform::compute_peaks(bytes) {
        Ok(peaks) => Some((peaks, start.elapsed().as_millis())),
        Err(e) => {
            log::warn!("waveform: decode {} failed: {}", path, e);
            None
        }
    }
}
