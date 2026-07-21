use anyhow::{Context, Result};
use rodio::{Decoder, OutputStream, OutputStreamBuilder, Sink, Source};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Sender};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use super::cache::Cache;

const TICK_INTERVAL: Duration = Duration::from_millis(50);
const TIME_EMIT_INTERVAL: Duration = Duration::from_millis(100);

/// Whole track file resident in RAM. Shared (cheaply cloned) between the
/// playing `Decoder` and the retained copy used for seeking, so playback and
/// seek never touch the (possibly networked) filesystem again after load.
type Bytes = Arc<[u8]>;

pub enum Cmd {
    Load {
        /// Track id, used to consult the shared prefetch cache before falling
        /// back to a filesystem read.
        id: i64,
        path: PathBuf,
        duration: Option<f64>,
    },
    Play,
    Pause,
    Stop,
    Seek(f64),
    SetVolume(f32),
}

/// Result of a background file read, routed back to the worker thread.
/// `generation` lets the worker discard reads that a newer `Load`/`Stop` has
/// superseded (e.g. the user skipped again before a slow read finished).
struct LoadMsg {
    generation: u64,
    duration: Option<f64>,
    bytes: Result<Bytes>,
}

struct Topics {
    time: String,
    duration: String,
    pause_state: String,
    ended: String,
    error: String,
    buffering: String,
}

impl Topics {
    fn new(prefix: &str) -> Self {
        Self {
            time: format!("{prefix}:time"),
            duration: format!("{prefix}:duration"),
            pause_state: format!("{prefix}:pause-state"),
            ended: format!("{prefix}:ended"),
            error: format!("{prefix}:error"),
            buffering: format!("{prefix}:buffering"),
        }
    }
}

pub struct PlayerHandle {
    tx: Sender<Cmd>,
}

impl PlayerHandle {
    pub fn spawn(
        app: AppHandle,
        device: Option<cpal::Device>,
        event_prefix: &'static str,
        cache: Arc<Cache>,
    ) -> Self {
        let (tx, rx) = channel();
        let topics = Topics::new(event_prefix);
        thread::spawn(move || {
            if let Err(e) = run(app.clone(), rx, device, &topics, cache) {
                log::error!("[{}] player thread exited: {}", event_prefix, e);
                let _ = app.emit(&topics.error, e.to_string());
            }
        });
        Self { tx }
    }

    pub fn send(&self, cmd: Cmd) {
        let _ = self.tx.send(cmd);
    }
}

struct State {
    current_path: Option<PathBuf>,
    current_duration: Option<f64>,
    /// Bytes of the currently loaded track, kept so seeks re-decode from RAM.
    current_bytes: Option<Bytes>,
    seek_offset: f64,
    active: bool,
    /// A background read is in flight; suppresses ended-detection and time
    /// emits until the source is ready.
    loading: bool,
    /// Monotonic token identifying the most recent load intent. Bumped on every
    /// `Load` and `Stop`; background reads carry the token they were issued for.
    generation: u64,
    volume: f32,
}

const AUDIO_BUFFER_FRAMES: u32 = 4096;

fn open_stream(device: Option<cpal::Device>) -> Result<OutputStream> {
    let builder = match device {
        Some(d) => OutputStreamBuilder::from_device(d).context("from_device")?,
        None => OutputStreamBuilder::from_default_device().context("from_default_device")?,
    };
    builder
        .with_buffer_size(cpal::BufferSize::Fixed(AUDIO_BUFFER_FRAMES))
        .open_stream()
        .context("open_stream")
}

fn run(
    app: AppHandle,
    rx: std::sync::mpsc::Receiver<Cmd>,
    device: Option<cpal::Device>,
    topics: &Topics,
    cache: Arc<Cache>,
) -> Result<()> {
    let stream = open_stream(device)?;
    let mut sink = Sink::connect_new(stream.mixer());
    // Completed background reads arrive here; `load_tx` is cloned per read.
    let (load_tx, load_rx) = channel::<LoadMsg>();
    let mut last_time_emit = Instant::now()
        .checked_sub(TIME_EMIT_INTERVAL)
        .unwrap_or_else(Instant::now);
    let mut state = State {
        current_path: None,
        current_duration: None,
        current_bytes: None,
        seek_offset: 0.0,
        active: false,
        loading: false,
        generation: 0,
        volume: 1.0,
    };

    loop {
        loop {
            match rx.try_recv() {
                Ok(cmd) => apply(
                    &app, &stream, &mut sink, &mut state, topics, &load_tx, &cache, cmd,
                ),
                Err(std::sync::mpsc::TryRecvError::Empty) => break,
                Err(std::sync::mpsc::TryRecvError::Disconnected) => return Ok(()),
            }
        }

        // Drain any completed background reads.
        while let Ok(msg) = load_rx.try_recv() {
            apply_load(&app, &stream, &mut sink, &mut state, topics, msg);
        }

        if state.active && last_time_emit.elapsed() >= TIME_EMIT_INTERVAL {
            last_time_emit = Instant::now();
            let pos = state.seek_offset + sink.get_pos().as_secs_f64();
            let _ = app.emit(&topics.time, pos);
        }

        if state.active && !state.loading && sink.empty() {
            state.active = false;
            let _ = app.emit(&topics.pause_state, true);
            let _ = app.emit(&topics.ended, ());
        }

        thread::sleep(TICK_INTERVAL);
    }
}

#[allow(clippy::too_many_arguments)]
fn apply(
    app: &AppHandle,
    stream: &OutputStream,
    sink: &mut Sink,
    state: &mut State,
    topics: &Topics,
    load_tx: &Sender<LoadMsg>,
    cache: &Arc<Cache>,
    cmd: Cmd,
) {
    match cmd {
        Cmd::Load { id, path, duration } => {
            // Stop current audio immediately; the new source arrives once the
            // background read completes.
            sink.stop();
            *sink = Sink::connect_new(stream.mixer());
            sink.set_volume(state.volume);

            state.generation = state.generation.wrapping_add(1);
            state.current_path = Some(path.clone());
            state.current_duration = duration;
            state.current_bytes = None;
            state.seek_offset = 0.0;
            state.active = false;
            state.loading = true;
            let _ = app.emit(&topics.buffering, true);

            let generation = state.generation;
            let tx = load_tx.clone();
            if let Some(bytes) = cache.get(id) {
                // Cache hit: route the resident bytes through the same
                // completion path as a background read — no filesystem access.
                let _ = tx.send(LoadMsg {
                    generation,
                    duration,
                    bytes: Ok(bytes),
                });
            } else {
                // Miss: read the whole file off the worker thread so a
                // slow/networked read never blocks transport commands.
                thread::spawn(move || {
                    let bytes = read_file(&path);
                    let _ = tx.send(LoadMsg {
                        generation,
                        duration,
                        bytes,
                    });
                });
            }
        }
        Cmd::Play => {
            sink.play();
            // Only report playing if there is (or will be) something to play.
            if state.active || state.loading {
                let _ = app.emit(&topics.pause_state, false);
            }
        }
        Cmd::Pause => {
            sink.pause();
            let _ = app.emit(&topics.pause_state, true);
        }
        Cmd::Stop => {
            sink.stop();
            *sink = Sink::connect_new(stream.mixer());
            sink.set_volume(state.volume);
            // Invalidate any in-flight read.
            state.generation = state.generation.wrapping_add(1);
            state.active = false;
            state.loading = false;
            state.current_path = None;
            state.current_duration = None;
            state.current_bytes = None;
            state.seek_offset = 0.0;
            let _ = app.emit(&topics.buffering, false);
            let _ = app.emit(&topics.pause_state, true);
        }
        Cmd::Seek(s) => {
            let target = s.max(0.0);
            // Seek decodes from the in-RAM bytes — never re-reads the file.
            let Some(bytes) = state.current_bytes.clone() else {
                return;
            };
            let was_paused = sink.is_paused();
            sink.stop();
            *sink = Sink::connect_new(stream.mixer());
            sink.set_volume(state.volume);
            match decode_bytes(bytes) {
                Ok((mut source, _)) => {
                    let target_dur = Duration::from_secs_f64(target);
                    match source.try_seek(target_dur) {
                        Ok(()) => {
                            sink.append(source);
                            state.seek_offset = target;
                        }
                        Err(e) => {
                            log::warn!(
                                "player: container seek failed ({}); skip_duration fallback",
                                e
                            );
                            let skipped = source.skip_duration(target_dur);
                            sink.append(skipped);
                            state.seek_offset = target;
                        }
                    }
                    state.active = true;
                    if was_paused {
                        sink.pause();
                    } else {
                        sink.play();
                    }
                }
                Err(e) => {
                    log::error!("player: seek decode failed: {}", e);
                    let _ = app.emit(&topics.error, format!("seek failed: {}", e));
                    state.active = false;
                }
            }
        }
        Cmd::SetVolume(v) => {
            let clamped = v.clamp(0.0, 1.0);
            state.volume = clamped;
            sink.set_volume(clamped);
        }
    }
}

/// Handle a completed background read. Stale results (superseded by a newer
/// `Load`/`Stop`) are dropped.
fn apply_load(
    app: &AppHandle,
    _stream: &OutputStream,
    sink: &mut Sink,
    state: &mut State,
    topics: &Topics,
    msg: LoadMsg,
) {
    if msg.generation != state.generation {
        return; // superseded
    }
    state.loading = false;
    let _ = app.emit(&topics.buffering, false);

    let bytes = match msg.bytes {
        Ok(b) => b,
        Err(e) => {
            let path = state
                .current_path
                .as_ref()
                .map(|p| p.display().to_string())
                .unwrap_or_default();
            log::error!("player: read {} failed: {}", path, e);
            let _ = app.emit(&topics.error, format!("read failed: {}", e));
            reset_after_failure(state);
            let _ = app.emit(&topics.pause_state, true);
            return;
        }
    };

    match decode_bytes(bytes.clone()) {
        Ok((source, decoded_duration)) => {
            let final_duration = msg.duration.or(decoded_duration);
            sink.append(source);
            sink.play();
            state.current_bytes = Some(bytes);
            state.current_duration = final_duration;
            state.seek_offset = 0.0;
            state.active = true;
            if let Some(d) = final_duration {
                let _ = app.emit(&topics.duration, d);
            }
            let _ = app.emit(&topics.pause_state, false);
        }
        Err(e) => {
            log::error!("player: decode failed: {}", e);
            let _ = app.emit(&topics.error, format!("decode failed: {}", e));
            reset_after_failure(state);
            let _ = app.emit(&topics.pause_state, true);
        }
    }
}

fn reset_after_failure(state: &mut State) {
    state.active = false;
    state.loading = false;
    state.current_path = None;
    state.current_duration = None;
    state.current_bytes = None;
    state.seek_offset = 0.0;
}

fn read_file(path: &Path) -> Result<Bytes> {
    let vec = std::fs::read(path).with_context(|| format!("read {}", path.display()))?;
    Ok(Arc::from(vec.into_boxed_slice()))
}

fn decode_bytes(bytes: Bytes) -> Result<(Decoder<Cursor<Bytes>>, Option<f64>)> {
    let decoder = Decoder::new(Cursor::new(bytes)).context("decoder")?;
    let total = decoder.total_duration().map(|d| d.as_secs_f64());
    Ok((decoder, total))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a minimal valid 16-bit mono PCM WAV in memory so decode tests are
    /// hermetic (no fixture files, no audio device).
    fn synth_wav(sample_rate: u32, samples: u32) -> Vec<u8> {
        let bits_per_sample = 16u16;
        let channels = 1u16;
        let byte_rate = sample_rate * channels as u32 * (bits_per_sample as u32 / 8);
        let block_align = channels * (bits_per_sample / 8);
        let data_len = samples * (bits_per_sample as u32 / 8);
        let mut w = Vec::new();
        w.extend_from_slice(b"RIFF");
        w.extend_from_slice(&(36 + data_len).to_le_bytes());
        w.extend_from_slice(b"WAVE");
        w.extend_from_slice(b"fmt ");
        w.extend_from_slice(&16u32.to_le_bytes());
        w.extend_from_slice(&1u16.to_le_bytes()); // PCM
        w.extend_from_slice(&channels.to_le_bytes());
        w.extend_from_slice(&sample_rate.to_le_bytes());
        w.extend_from_slice(&byte_rate.to_le_bytes());
        w.extend_from_slice(&block_align.to_le_bytes());
        w.extend_from_slice(&bits_per_sample.to_le_bytes());
        w.extend_from_slice(b"data");
        w.extend_from_slice(&data_len.to_le_bytes());
        for i in 0..samples {
            let v = ((i % 32) as i16) * 100;
            w.extend_from_slice(&v.to_le_bytes());
        }
        w
    }

    #[test]
    fn decode_bytes_reports_duration() {
        let sample_rate = 8000;
        let samples = 8000; // exactly 1 second
        let bytes: Bytes = Arc::from(synth_wav(sample_rate, samples).into_boxed_slice());
        let (_source, duration) = decode_bytes(bytes).expect("decode");
        let d = duration.expect("duration present");
        assert!((d - 1.0).abs() < 0.05, "expected ~1.0s, got {d}");
    }

    #[test]
    fn decode_bytes_rejects_garbage() {
        let bytes: Bytes = Arc::from(vec![0u8, 1, 2, 3, 4, 5].into_boxed_slice());
        assert!(decode_bytes(bytes).is_err());
    }

    #[test]
    fn read_file_missing_path_errors() {
        assert!(read_file(Path::new("/nonexistent/diodedj/nope.wav")).is_err());
    }

    /// The worker only applies a background read if its generation still matches
    /// the latest intent. This mirrors the guard in `apply_load`.
    #[test]
    fn stale_generation_is_discarded() {
        let latest = 5u64;
        let stale = LoadMsg {
            generation: 4,
            duration: None,
            bytes: Ok(Arc::from(Vec::new().into_boxed_slice())),
        };
        let fresh = LoadMsg {
            generation: 5,
            duration: None,
            bytes: Ok(Arc::from(Vec::new().into_boxed_slice())),
        };
        assert_ne!(stale.generation, latest);
        assert_eq!(fresh.generation, latest);
    }
}
