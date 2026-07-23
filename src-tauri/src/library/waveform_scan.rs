//! Background waveform computation, decoupled from the metadata scan.
//!
//! The metadata scan (tag reads) is fast and finishes quickly. Computing a
//! track's amplitude curve requires a full audio decode, which is far heavier —
//! so it runs here, on its own worker thread, after the scan. Waveforms land in
//! the DB one at a time and a `waveform-ready` event is emitted per track so the
//! renderer can refresh a curve for the deck that is currently showing it.
//!
//! The job is single-flight (only one worker at a time) and cancelable. It
//! drains [`Db::tracks_missing_waveform`] in a loop so tracks added while it runs
//! are still picked up; ids that fail to decode are remembered for the run so a
//! permanently-undecodable file never causes an infinite retry loop.

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

use super::db::Db;
use crate::audio::waveform;

/// Event emitted after a track's waveform is stored. Payload is the track id.
const WAVEFORM_READY_EVENT: &str = "waveform-ready";

#[derive(Default)]
pub struct WaveformJob {
    running: AtomicBool,
    cancel: AtomicBool,
}

impl WaveformJob {
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
}

fn run(job: &WaveformJob, app: &AppHandle, db: &Db) {
    // Ids that failed to decode this run — skipped on subsequent passes so a
    // permanently-broken file cannot wedge the drain loop.
    let mut failed: HashSet<i64> = HashSet::new();

    loop {
        if job.cancel.load(Ordering::SeqCst) {
            return;
        }
        let missing = match db.tracks_missing_waveform() {
            Ok(m) => m,
            Err(e) => {
                log::error!("waveform: query missing failed: {}", e);
                return;
            }
        };
        // Only work left is the set we've already given up on → done.
        let mut did_work = false;
        for (id, path, duration) in missing {
            if job.cancel.load(Ordering::SeqCst) {
                return;
            }
            if failed.contains(&id) {
                continue;
            }
            did_work = true;
            match compute(&path, duration) {
                Some(peaks) => {
                    if let Err(e) = db.set_waveform(id, &peaks) {
                        log::error!("waveform: store {} failed: {}", id, e);
                        failed.insert(id);
                        continue;
                    }
                    let _ = app.emit(WAVEFORM_READY_EVENT, id);
                }
                None => {
                    failed.insert(id);
                }
            }
        }
        if !did_work {
            return;
        }
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
