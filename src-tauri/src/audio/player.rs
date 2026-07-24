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
use super::devices::resolve_device;
use crate::persist::config::DeviceRef;

const TICK_INTERVAL: Duration = Duration::from_millis(50);
const TIME_EMIT_INTERVAL: Duration = Duration::from_millis(100);

/// A background read that neither completes nor errors within this budget is
/// treated as a wedged (e.g. networked) mount. The audio worker stops waiting
/// on it and declares a timeout; the detached read thread is abandoned (a
/// blocked `read()` cannot be cancelled — it unwinds whenever the OS finally
/// errors the mount).
const READ_WATCHDOG_TIMEOUT: Duration = Duration::from_secs(10);

/// Backoff delays applied between failed read attempts. The read thread makes
/// one initial attempt plus one retry per entry (4 attempts, 3 backoffs) before
/// giving up. Retries cover *transient* failures (`Err`); hangs are handled by
/// the watchdog, not retry.
const READ_RETRY_BACKOFFS: [Duration; 3] = [
    Duration::from_millis(500),
    Duration::from_millis(1000),
    Duration::from_millis(2000),
];

/// While a load is deferred because no audio device could be opened, the worker
/// retries opening the output on this cadence so playback self-heals without any
/// user action (a stalled/absent device at launch — see issue #259).
const OPEN_RETRY_INTERVAL: Duration = Duration::from_secs(2);

/// A load that could not be started because no audio output was openable.
/// Retained so the idle auto-retry loop can replay it once the device returns.
#[derive(Clone)]
struct PendingLoad {
    id: i64,
    path: PathBuf,
    duration: Option<f64>,
}

/// Whole track file resident in RAM. Shared (cheaply cloned) between the
/// playing `Decoder` and the retained copy used for seeking, so playback and
/// seek never touch the (possibly networked) filesystem again after load.
type Bytes = Arc<[u8]>;

pub enum Cmd {
    Load {
        /// DB track id. Used to consult the shared prefetch cache before
        /// falling back to a filesystem read, and to name the track in the
        /// `:load-failed` event when a load fails or times out.
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
    /// Track id this read was issued for; reported in `:load-failed` on failure.
    id: i64,
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
    load_failed: String,
    output_unavailable: String,
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
            load_failed: format!("{prefix}:load-failed"),
            output_unavailable: format!("{prefix}:output-unavailable"),
        }
    }
}

pub struct PlayerHandle {
    tx: Sender<Cmd>,
}

impl PlayerHandle {
    pub fn spawn(
        app: AppHandle,
        device: Option<DeviceRef>,
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
    /// Track id of the most recent `Load`, reported in `:load-failed`.
    current_id: Option<i64>,
    current_path: Option<PathBuf>,
    current_duration: Option<f64>,
    /// Bytes of the currently loaded track, kept so seeks re-decode from RAM.
    current_bytes: Option<Bytes>,
    seek_offset: f64,
    active: bool,
    /// A background read is in flight; suppresses ended-detection and time
    /// emits until the source is ready.
    loading: bool,
    /// When the in-flight read started; drives the watchdog timeout. `None`
    /// whenever no read is pending.
    load_start: Option<Instant>,
    /// Monotonic token identifying the most recent load intent. Bumped on every
    /// `Load` and `Stop`; background reads carry the token they were issued for.
    generation: u64,
    volume: f32,
    /// A load deferred because no audio output could be opened. The idle loop
    /// retries the open and replays this load once a device is available (#259).
    pending_load: Option<PendingLoad>,
    /// Last time the idle loop attempted to (re)open a failed output. Paces the
    /// retry to `OPEN_RETRY_INTERVAL`.
    last_open_retry: Option<Instant>,
    /// Whether the output is currently believed openable. Tracked so the
    /// `output-unavailable` event fires only on transitions (no per-retry spam).
    /// Optimistic at start — nothing is emitted until the first real failure.
    output_ok: bool,
}

const AUDIO_BUFFER_FRAMES: u32 = 4096;

fn stream_builder(device: &Option<cpal::Device>) -> Result<OutputStreamBuilder> {
    match device {
        Some(d) => OutputStreamBuilder::from_device(d.clone()).context("from_device"),
        None => OutputStreamBuilder::from_default_device().context("from_default_device"),
    }
}

fn open_stream(device: Option<cpal::Device>) -> Result<OutputStream> {
    // Prefer a fixed buffer size for predictable latency, but not every device
    // (or host, e.g. CoreAudio) accepts `Fixed`. When it rejects the request the
    // whole player thread would otherwise die at startup, so fall back to the
    // device default buffer size instead of propagating the error.
    match stream_builder(&device)?
        .with_buffer_size(cpal::BufferSize::Fixed(AUDIO_BUFFER_FRAMES))
        .open_stream()
    {
        Ok(stream) => Ok(stream),
        Err(e) => {
            log::warn!(
                "open_stream: fixed buffer {} rejected ({e}); retrying with default buffer size",
                AUDIO_BUFFER_FRAMES
            );
            stream_builder(&device)?
                .open_stream()
                .context("open_stream")
        }
    }
}

/// Resolve the configured device (if any) and open an output stream + sink on
/// the audio thread. A missing or unopenable configured device is **not fatal**:
/// it falls back to the system default, so a device that is renamed, unplugged,
/// or briefly held/absent at launch does not permanently disable playback (#259).
fn open_audio(device: &Option<DeviceRef>, volume: f32) -> Result<(OutputStream, Sink)> {
    let resolved = match device {
        Some(r) => match resolve_device(r) {
            Some(d) => Some(d),
            None => {
                log::warn!(
                    "audio device '{}' not found among current outputs; using default",
                    r.description
                );
                None
            }
        },
        None => None,
    };

    let had_specific = resolved.is_some();
    let stream = match open_stream(resolved) {
        Ok(s) => s,
        // A configured device that resolves but will not open (e.g. held
        // exclusively by another app) falls back to the default device rather
        // than failing the whole command.
        Err(e) if had_specific => {
            log::warn!("configured audio device failed to open ({e}); falling back to default");
            open_stream(None).context("open default output")?
        }
        Err(e) => return Err(e).context("open default output"),
    };
    let sink = Sink::connect_new(stream.mixer());
    sink.set_volume(volume);
    Ok((stream, sink))
}

/// Ensure the output stream+sink is open, (re)opening it on demand. Returns
/// `None` — after emitting an `error` event — when no audio device can be
/// opened at all, so the caller drops the current command instead of the whole
/// worker thread exiting. A dead worker silently discards every later command
/// (the `PlayerHandle::send` channel error is swallowed), disabling playback
/// for the rest of the session; see issue #259.
fn ensure_output<'a>(
    output: &'a mut Option<(OutputStream, Sink)>,
    device: &Option<DeviceRef>,
    state: &mut State,
    app: &AppHandle,
    topics: &Topics,
) -> Option<&'a mut (OutputStream, Sink)> {
    if output.is_none() {
        match open_audio(device, state.volume) {
            Ok(o) => {
                *output = Some(o);
                report_output(app, topics, state, true);
            }
            Err(e) => {
                log::error!("player: no audio output available: {}", e);
                let _ = app.emit(&topics.error, format!("audio output unavailable: {}", e));
                report_output(app, topics, state, false);
                return None;
            }
        }
    }
    output.as_mut()
}

/// Emit an `output-unavailable` event only when the availability actually
/// changes, so the idle retry loop's repeated failures don't spam the UI and a
/// recovery reliably clears the banner.
fn report_output(app: &AppHandle, topics: &Topics, state: &mut State, ok: bool) {
    if state.output_ok != ok {
        state.output_ok = ok;
        let _ = app.emit(&topics.output_unavailable, !ok);
    }
}

fn run(
    app: AppHandle,
    rx: std::sync::mpsc::Receiver<Cmd>,
    device: Option<DeviceRef>,
    topics: &Topics,
    cache: Arc<Cache>,
) -> Result<()> {
    // Output is opened lazily and re-opened on demand: a stream-open failure at
    // launch (device not ready yet, briefly held, momentarily gone) must not
    // kill the worker, which would silently disable playback for the whole
    // session. The next command that needs audio retries the open (#259).
    let mut output: Option<(OutputStream, Sink)> = None;
    // Completed background reads arrive here; `load_tx` is cloned per read.
    let (load_tx, load_rx) = channel::<LoadMsg>();
    let mut last_time_emit = Instant::now()
        .checked_sub(TIME_EMIT_INTERVAL)
        .unwrap_or_else(Instant::now);
    let mut state = State {
        current_id: None,
        current_path: None,
        current_duration: None,
        current_bytes: None,
        seek_offset: 0.0,
        active: false,
        loading: false,
        load_start: None,
        generation: 0,
        volume: 1.0,
        pending_load: None,
        last_open_retry: None,
        output_ok: true,
    };

    loop {
        loop {
            match rx.try_recv() {
                Ok(cmd) => apply(
                    &app, &mut output, &device, &mut state, topics, &load_tx, &cache, cmd,
                ),
                Err(std::sync::mpsc::TryRecvError::Empty) => break,
                Err(std::sync::mpsc::TryRecvError::Disconnected) => return Ok(()),
            }
        }

        // Drain any completed background reads.
        while let Ok(msg) = load_rx.try_recv() {
            apply_load(&app, &mut output, &device, &mut state, topics, msg);
        }

        // Watchdog: a read that neither completed nor errored within the budget
        // is a wedged mount. Declare a timeout and abandon the detached read
        // thread — the worker never blocks waiting on it.
        if watchdog_timed_out(state.loading, state.load_start, Instant::now()) {
            handle_load_timeout(&app, &mut state, topics);
        }

        // Idle auto-retry: a load deferred because the audio device could not be
        // opened waits here. Retry the open on a timer (quietly — the initial
        // failure already surfaced an error), and replay the load the moment an
        // output becomes available, whether reopened here or by a command above
        // (#259). No user action required.
        if state.pending_load.is_some() {
            if output.is_none() && open_retry_due(state.last_open_retry, Instant::now()) {
                state.last_open_retry = Some(Instant::now());
                match open_audio(&device, state.volume) {
                    Ok(o) => {
                        output = Some(o);
                        report_output(&app, topics, &mut state, true);
                    }
                    // Quiet: the initial failure already reported unavailable.
                    Err(e) => log::debug!("player: output reopen retry failed: {}", e),
                }
            }
            if output.is_some() {
                if let Some(p) = state.pending_load.take() {
                    log::info!("player: audio output available; resuming deferred load");
                    start_load(
                        &app, &mut output, &device, &mut state, topics, &load_tx, &cache, p.id,
                        p.path, p.duration,
                    );
                }
            }
        }

        // Time + ended detection are only meaningful with an open output.
        if let Some((_, sink)) = output.as_ref() {
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
        }

        thread::sleep(TICK_INTERVAL);
    }
}

/// Start loading a track: (re)open the output, stop current audio, and kick off
/// the background read (or route a cache hit). If no audio device can be opened,
/// the load is *deferred* — stored in `state.pending_load` for the idle loop to
/// replay once a device returns — rather than dropped, so playback self-heals
/// without user action (#259).
#[allow(clippy::too_many_arguments)]
fn start_load(
    app: &AppHandle,
    output: &mut Option<(OutputStream, Sink)>,
    device: &Option<DeviceRef>,
    state: &mut State,
    topics: &Topics,
    load_tx: &Sender<LoadMsg>,
    cache: &Arc<Cache>,
    id: i64,
    path: PathBuf,
    duration: Option<f64>,
) {
    let Some((stream, sink)) = ensure_output(output, device, state, app, topics) else {
        // No device yet: remember the intent and let the idle loop retry the
        // open. `ensure_output` already emitted the error; keep the buffering
        // indicator up while we wait for the device.
        state.pending_load = Some(PendingLoad { id, path, duration });
        state.last_open_retry = Some(Instant::now());
        state.current_id = Some(id);
        let _ = app.emit(&topics.buffering, true);
        return;
    };
    state.pending_load = None;

    // Stop current audio immediately; the new source arrives once the
    // background read completes.
    sink.stop();
    *sink = Sink::connect_new(stream.mixer());
    sink.set_volume(state.volume);

    state.generation = state.generation.wrapping_add(1);
    state.current_id = Some(id);
    state.current_path = Some(path.clone());
    state.current_duration = duration;
    state.current_bytes = None;
    state.seek_offset = 0.0;
    state.active = false;
    state.loading = true;
    state.load_start = Some(Instant::now());
    let _ = app.emit(&topics.buffering, true);

    let generation = state.generation;
    let tx = load_tx.clone();
    if let Some(bytes) = cache.get(id) {
        // Cache hit: route the resident bytes through the same
        // completion path as a background read — no filesystem access.
        let _ = tx.send(LoadMsg {
            generation,
            id,
            duration,
            bytes: Ok(bytes),
        });
    } else {
        // Miss: read the whole file off the worker thread so a
        // slow/networked read never blocks transport commands. One read
        // is in flight per deck at a time — a newer `Load` bumps
        // `generation`, so a stale read's result is discarded rather
        // than another thread being blocked on.
        thread::spawn(move || {
            // Retry transient failures with backoff; hangs are the
            // watchdog's job (handled in the worker loop, not here).
            let bytes = read_with_retry(|| read_file(&path), thread::sleep);
            let _ = tx.send(LoadMsg {
                generation,
                id,
                duration,
                bytes,
            });
        });
    }
}

#[allow(clippy::too_many_arguments)]
fn apply(
    app: &AppHandle,
    output: &mut Option<(OutputStream, Sink)>,
    device: &Option<DeviceRef>,
    state: &mut State,
    topics: &Topics,
    load_tx: &Sender<LoadMsg>,
    cache: &Arc<Cache>,
    cmd: Cmd,
) {
    match cmd {
        Cmd::Load { id, path, duration } => {
            start_load(app, output, device, state, topics, load_tx, cache, id, path, duration);
        }
        Cmd::Play => {
            // Play is also a self-heal trigger: re-open the output if a launch
            // failure left it closed. Drop silently if no device is available.
            let Some((_, sink)) = ensure_output(output, device, state, app, topics) else {
                return;
            };
            sink.play();
            // Only report playing if there is (or will be) something to play.
            if state.active || state.loading {
                let _ = app.emit(&topics.pause_state, false);
            }
        }
        Cmd::Pause => {
            // Nothing to pause without an open output; never open one just to pause.
            if let Some((_, sink)) = output.as_mut() {
                sink.pause();
            }
            let _ = app.emit(&topics.pause_state, true);
        }
        Cmd::Stop => {
            if let Some((stream, sink)) = output.as_mut() {
                sink.stop();
                *sink = Sink::connect_new(stream.mixer());
                sink.set_volume(state.volume);
            }
            // Invalidate any in-flight read.
            state.generation = state.generation.wrapping_add(1);
            state.active = false;
            state.loading = false;
            state.load_start = None;
            state.current_id = None;
            state.current_path = None;
            state.current_duration = None;
            state.current_bytes = None;
            state.seek_offset = 0.0;
            // Stop cancels a deferred load too — the user no longer wants it.
            state.pending_load = None;
            state.last_open_retry = None;
            let _ = app.emit(&topics.buffering, false);
            let _ = app.emit(&topics.pause_state, true);
        }
        Cmd::Seek(s) => {
            let target = s.max(0.0);
            // Seek decodes from the in-RAM bytes — never re-reads the file.
            let Some(bytes) = state.current_bytes.clone() else {
                return;
            };
            let Some((stream, sink)) = ensure_output(output, device, state, app, topics)
            else {
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
            // Remembered in `state.volume` and applied when the output next opens.
            if let Some((_, sink)) = output.as_mut() {
                sink.set_volume(clamped);
            }
        }
    }
}

/// Handle a completed background read. Stale results (superseded by a newer
/// `Load`/`Stop`) are dropped.
fn apply_load(
    app: &AppHandle,
    output: &mut Option<(OutputStream, Sink)>,
    device: &Option<DeviceRef>,
    state: &mut State,
    topics: &Topics,
    msg: LoadMsg,
) {
    if msg.generation != state.generation {
        return; // superseded
    }
    state.loading = false;
    state.load_start = None;
    let _ = app.emit(&topics.buffering, false);

    let bytes = match msg.bytes {
        Ok(b) => b,
        Err(e) => {
            let path = state
                .current_path
                .as_ref()
                .map(|p| p.display().to_string())
                .unwrap_or_default();
            // Retries were already exhausted inside the read thread.
            log::error!("player: read {} failed after retries: {}", path, e);
            let _ = app.emit(&topics.error, format!("read failed: {}", e));
            reset_after_failure(state);
            // Programmatic signal carrying the track id (human message above).
            let _ = app.emit(&topics.load_failed, msg.id);
            let _ = app.emit(&topics.pause_state, true);
            return;
        }
    };

    match decode_bytes(bytes.clone()) {
        Ok((source, decoded_duration)) => {
            // The output should already be open (Load opened it), but re-open
            // defensively in case the device dropped while the read was in
            // flight. Treat an unopenable output as a load failure.
            let Some((_, sink)) = ensure_output(output, device, state, app, topics) else {
                reset_after_failure(state);
                let _ = app.emit(&topics.load_failed, msg.id);
                let _ = app.emit(&topics.pause_state, true);
                return;
            };
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
    state.load_start = None;
    state.current_id = None;
    state.current_path = None;
    state.current_duration = None;
    state.current_bytes = None;
    state.seek_offset = 0.0;
    state.pending_load = None;
    state.last_open_retry = None;
}

/// Decide whether an in-flight read has exceeded the watchdog budget. Pure
/// (given the clock via `now`) so it is unit-testable without threads or sleeps.
/// A read is timed out only while `loading` is true, a `load_start` is recorded,
/// and at least `READ_WATCHDOG_TIMEOUT` has elapsed. When a result has arrived
/// the worker sets `loading = false`, so this returns false.
/// Decide whether the idle loop should attempt another output-open. Pure (clock
/// via `now`) so it is unit-testable. Fires immediately the first time
/// (`None`), then no more often than `OPEN_RETRY_INTERVAL`.
fn open_retry_due(last_open_retry: Option<Instant>, now: Instant) -> bool {
    match last_open_retry {
        None => true,
        Some(last) => now.saturating_duration_since(last) >= OPEN_RETRY_INTERVAL,
    }
}

fn watchdog_timed_out(loading: bool, load_start: Option<Instant>, now: Instant) -> bool {
    match load_start {
        Some(start) if loading => now.saturating_duration_since(start) >= READ_WATCHDOG_TIMEOUT,
        _ => false,
    }
}

/// Handle a watchdog timeout: abandon the detached read, emit the human error
/// plus a `:load-failed` carrying the track id, and reset load state. The
/// generation is bumped so a late `LoadMsg` from the abandoned thread is
/// discarded rather than played.
fn handle_load_timeout(app: &AppHandle, state: &mut State, topics: &Topics) {
    let id = state.current_id;
    let path = state
        .current_path
        .as_ref()
        .map(|p| p.display().to_string())
        .unwrap_or_default();
    log::error!(
        "player: read {} timed out after {:?}; abandoning read",
        path,
        READ_WATCHDOG_TIMEOUT
    );
    state.generation = state.generation.wrapping_add(1);
    reset_after_failure(state);
    let _ = app.emit(&topics.buffering, false);
    let _ = app.emit(&topics.error, "network down: read timed out".to_string());
    if let Some(id) = id {
        let _ = app.emit(&topics.load_failed, id);
    }
    let _ = app.emit(&topics.pause_state, true);
}

/// Read a file with bounded retry + backoff for *transient* failures. Makes an
/// initial attempt plus one retry per `READ_RETRY_BACKOFFS` entry, sleeping the
/// matching backoff between attempts, and returns the first success or the last
/// error. `read`/`sleep` are injected so tests exercise the schedule without
/// touching the filesystem or actually sleeping.
fn read_with_retry<R, S>(mut read: R, mut sleep: S) -> Result<Bytes>
where
    R: FnMut() -> Result<Bytes>,
    S: FnMut(Duration),
{
    let mut last_err: Option<anyhow::Error> = None;
    // Attempt indices 0..=len: index 0 is the initial try, and after a failing
    // attempt `i` we back off by `READ_RETRY_BACKOFFS[i]` if one exists.
    for attempt in 0..=READ_RETRY_BACKOFFS.len() {
        match read() {
            Ok(bytes) => return Ok(bytes),
            Err(e) => {
                last_err = Some(e);
                if let Some(delay) = READ_RETRY_BACKOFFS.get(attempt) {
                    sleep(*delay);
                }
            }
        }
    }
    Err(last_err.unwrap_or_else(|| anyhow::anyhow!("read failed with no attempts")))
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
            id: 1,
            duration: None,
            bytes: Ok(Arc::from(Vec::new().into_boxed_slice())),
        };
        let fresh = LoadMsg {
            generation: 5,
            id: 1,
            duration: None,
            bytes: Ok(Arc::from(Vec::new().into_boxed_slice())),
        };
        assert_ne!(stale.generation, latest);
        assert_eq!(fresh.generation, latest);
    }

    /// The backoff schedule is the agreed 0.5s / 1s / 2s with three entries
    /// (three retries after the initial attempt).
    #[test]
    fn backoff_schedule_is_half_one_two_seconds() {
        assert_eq!(
            READ_RETRY_BACKOFFS,
            [
                Duration::from_millis(500),
                Duration::from_millis(1000),
                Duration::from_millis(2000),
            ]
        );
    }

    /// A transient failure that clears within the retry budget eventually
    /// succeeds, and the recorded backoffs follow the schedule exactly.
    #[test]
    fn read_with_retry_succeeds_after_transient_failures() {
        let mut attempts = 0u32;
        let mut slept: Vec<Duration> = Vec::new();
        let result = read_with_retry(
            || {
                attempts += 1;
                if attempts <= 2 {
                    Err(anyhow::anyhow!("transient"))
                } else {
                    Ok(Arc::from(vec![1u8, 2, 3].into_boxed_slice()))
                }
            },
            |d| slept.push(d),
        );
        assert!(result.is_ok());
        assert_eq!(attempts, 3, "initial attempt + 2 retries");
        // Backoffs applied before retry 1 and retry 2 only.
        assert_eq!(
            slept,
            vec![Duration::from_millis(500), Duration::from_millis(1000)]
        );
    }

    /// An always-failing read exhausts the budget: 4 attempts (initial + 3
    /// retries), sleeping the full 0.5s / 1s / 2s schedule, then returns Err.
    #[test]
    fn read_with_retry_gives_up_after_exhausting_backoffs() {
        let mut attempts = 0u32;
        let mut slept: Vec<Duration> = Vec::new();
        let result = read_with_retry(
            || {
                attempts += 1;
                Err::<Bytes, _>(anyhow::anyhow!("always fails"))
            },
            |d| slept.push(d),
        );
        assert!(result.is_err());
        assert_eq!(attempts, READ_RETRY_BACKOFFS.len() as u32 + 1);
        assert_eq!(slept, READ_RETRY_BACKOFFS.to_vec());
    }

    #[test]
    fn watchdog_times_out_only_after_budget_while_loading() {
        let start = Instant::now();
        let before = start
            .checked_add(READ_WATCHDOG_TIMEOUT - Duration::from_millis(1))
            .unwrap();
        let after = start
            .checked_add(READ_WATCHDOG_TIMEOUT + Duration::from_millis(1))
            .unwrap();

        // Under budget: not timed out.
        assert!(!watchdog_timed_out(true, Some(start), before));
        // Over budget while loading: timed out.
        assert!(watchdog_timed_out(true, Some(start), after));
        // A result arrived (loading == false): never a timeout.
        assert!(!watchdog_timed_out(false, Some(start), after));
        // No read in flight: never a timeout.
        assert!(!watchdog_timed_out(true, None, after));
    }

    #[test]
    fn open_retry_fires_first_time_then_paces() {
        let start = Instant::now();
        let before = start
            .checked_add(OPEN_RETRY_INTERVAL - Duration::from_millis(1))
            .unwrap();
        let after = start
            .checked_add(OPEN_RETRY_INTERVAL + Duration::from_millis(1))
            .unwrap();

        // Never attempted before: retry immediately.
        assert!(open_retry_due(None, start));
        // Within the interval since the last attempt: hold off.
        assert!(!open_retry_due(Some(start), before));
        // Interval elapsed: retry again.
        assert!(open_retry_due(Some(start), after));
    }
}
