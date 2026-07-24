use parking_lot::Mutex;
use serde::Serialize;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use super::db::Db;
use super::scanner;
use super::waveform_scan::WaveformJob;
use crate::persist::config::Config;

#[derive(Serialize, Clone)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ScanStatus {
    #[serde(rename_all = "camelCase")]
    Idle {
        last_result: Option<ScanResult>,
    },
    Running {
        processed: usize,
        total: usize,
    },
    Canceled {
        processed: usize,
        total: usize,
        added: usize,
    },
    Error {
        message: String,
    },
}

#[derive(Serialize, Clone)]
pub struct ScanResult {
    pub total: usize,
    pub added: usize,
}

#[derive(Serialize, Clone)]
struct ScanProgress {
    processed: usize,
    total: usize,
}

#[derive(Serialize, Clone)]
pub struct StartResult {
    #[serde(rename = "alreadyRunning")]
    pub already_running: bool,
}

struct Inner {
    status: ScanStatus,
    cancel: Option<Arc<AtomicBool>>,
}

pub struct ScanState {
    inner: Mutex<Inner>,
}

impl Default for ScanState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(Inner {
                status: ScanStatus::Idle { last_result: None },
                cancel: None,
            }),
        }
    }
}

impl ScanState {
    pub fn status(&self) -> ScanStatus {
        self.inner.lock().status.clone()
    }

    pub fn is_running(&self) -> bool {
        matches!(self.inner.lock().status, ScanStatus::Running { .. })
    }

    pub fn cancel(&self) {
        if let Some(token) = &self.inner.lock().cancel {
            token.store(true, Ordering::SeqCst);
        }
    }

    fn emit_status(&self, app: &AppHandle, next: ScanStatus) {
        self.inner.lock().status = next.clone();
        let _ = app.emit("scan-state-changed", &next);
    }

    pub fn start(
        self: Arc<Self>,
        app: AppHandle,
        db: Arc<Db>,
        config: Arc<Config>,
        waveform: Arc<WaveformJob>,
    ) -> StartResult {
        if self.is_running() {
            return StartResult {
                already_running: true,
            };
        }
        let cancel = Arc::new(AtomicBool::new(false));
        {
            let mut g = self.inner.lock();
            g.status = ScanStatus::Running {
                processed: 0,
                total: 0,
            };
            g.cancel = Some(cancel.clone());
        }
        let _ = app.emit(
            "scan-state-changed",
            &ScanStatus::Running {
                processed: 0,
                total: 0,
            },
        );

        let s = Arc::clone(&self);
        std::thread::spawn(move || {
            run(s, app, db, config, waveform, cancel);
        });
        StartResult {
            already_running: false,
        }
    }
}

fn run(
    state: Arc<ScanState>,
    app: AppHandle,
    db: Arc<Db>,
    config: Arc<Config>,
    waveform: Arc<WaveformJob>,
    cancel: Arc<AtomicBool>,
) {
    const PROGRESS_THROTTLE: Duration = Duration::from_millis(200);
    let mut cum_processed: usize = 0;
    let mut cum_total: usize = 0;
    let mut cum_added: usize = 0;
    let mut live_by_root: Vec<(String, HashSet<String>)> = Vec::new();
    let last_emit = Arc::new(Mutex::new(Instant::now() - PROGRESS_THROTTLE));

    let outcome: anyhow::Result<()> = (|| {
        let all_paths = config.get_all_paths_flat();
        db.remove_tracks_not_in_paths(&all_paths)?;

        for content_type in ["music", "commercial", "jingle"] {
            let paths = config.get_paths(content_type);
            for p in paths {
                let path = std::path::PathBuf::from(&p);
                let cancel_check = || cancel.load(Ordering::SeqCst);
                let snapshot_total = cum_total;
                let snapshot_processed = cum_processed;
                let s_clone = state.clone();
                let app_clone = app.clone();
                let last_emit_clone = last_emit.clone();
                let r = scanner::scan_directory(
                    &db,
                    &path,
                    content_type,
                    &cancel_check,
                    move |processed, total| {
                        let proc_now = snapshot_processed + processed;
                        let total_now = snapshot_total + total;
                        s_clone.inner.lock().status = ScanStatus::Running {
                            processed: proc_now,
                            total: total_now,
                        };
                        let mut last = last_emit_clone.lock();
                        if last.elapsed() >= PROGRESS_THROTTLE {
                            *last = Instant::now();
                            drop(last);
                            let _ = app_clone.emit(
                                "scan-progress",
                                ScanProgress {
                                    processed: proc_now,
                                    total: total_now,
                                },
                            );
                        }
                    },
                )?;
                cum_processed += r.total;
                cum_total += r.total;
                cum_added += r.added;
                live_by_root.push((p, r.live_files.into_iter().collect()));
                if cancel.load(Ordering::SeqCst) {
                    state.emit_status(
                        &app,
                        ScanStatus::Canceled {
                            processed: cum_processed,
                            total: cum_total,
                            added: cum_added,
                        },
                    );
                    return Ok(());
                }
            }
        }

        let mut pruned = 0usize;
        for (root, live) in live_by_root {
            let dbpaths = db.get_paths_under(&root)?;
            let stale: Vec<String> = dbpaths.into_iter().filter(|p| !live.contains(p)).collect();
            if !stale.is_empty() {
                pruned += db.delete_by_paths(&stale)?;
            }
        }
        if pruned > 0 {
            log::info!("scan pruned {} missing files", pruned);
        }

        state.emit_status(
            &app,
            ScanStatus::Idle {
                last_result: Some(ScanResult {
                    total: cum_total,
                    added: cum_added,
                }),
            },
        );

        // Metadata is in — kick the async waveform pass. It runs on its own
        // thread and lands waveforms later, so the scan reports done now and
        // never blocks on the heavy per-track decode.
        Arc::clone(&waveform).start(app.clone(), Arc::clone(&db));
        Ok(())
    })();

    if let Err(e) = outcome {
        log::error!("scan failed: {}", e);
        state.emit_status(
            &app,
            ScanStatus::Error {
                message: e.to_string(),
            },
        );
    }

    state.inner.lock().cancel = None;
}
