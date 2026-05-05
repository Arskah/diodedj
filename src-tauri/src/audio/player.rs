use anyhow::{Context, Result};
use rodio::{Decoder, OutputStream, OutputStreamBuilder, Sink, Source};
use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::mpsc::{channel, Sender};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const TICK_INTERVAL: Duration = Duration::from_millis(50);
const TIME_EMIT_INTERVAL: Duration = Duration::from_millis(100);

pub enum Cmd {
    Load {
        path: PathBuf,
        duration: Option<f64>,
    },
    Play,
    Pause,
    Stop,
    Seek(f64),
    SetVolume(f32),
}

struct Topics {
    time: String,
    duration: String,
    pause_state: String,
    ended: String,
    error: String,
}

impl Topics {
    fn new(prefix: &str) -> Self {
        Self {
            time: format!("{prefix}:time"),
            duration: format!("{prefix}:duration"),
            pause_state: format!("{prefix}:pause-state"),
            ended: format!("{prefix}:ended"),
            error: format!("{prefix}:error"),
        }
    }
}

pub struct PlayerHandle {
    tx: Sender<Cmd>,
}

impl PlayerHandle {
    pub fn spawn(app: AppHandle, device: Option<cpal::Device>, event_prefix: &'static str) -> Self {
        let (tx, rx) = channel();
        let topics = Topics::new(event_prefix);
        thread::spawn(move || {
            if let Err(e) = run(app.clone(), rx, device, &topics) {
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
    seek_offset: f64,
    active: bool,
    volume: f32,
}

const AUDIO_BUFFER_FRAMES: u32 = 4096;
const DECODE_BUFREADER_CAPACITY: usize = 64 * 1024;

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
) -> Result<()> {
    let stream = open_stream(device)?;
    let mut sink = Sink::connect_new(stream.mixer());
    let mut last_time_emit = Instant::now()
        .checked_sub(TIME_EMIT_INTERVAL)
        .unwrap_or_else(Instant::now);
    let mut state = State {
        current_path: None,
        current_duration: None,
        seek_offset: 0.0,
        active: false,
        volume: 1.0,
    };

    loop {
        loop {
            match rx.try_recv() {
                Ok(cmd) => apply(&app, &stream, &mut sink, &mut state, topics, cmd),
                Err(std::sync::mpsc::TryRecvError::Empty) => break,
                Err(std::sync::mpsc::TryRecvError::Disconnected) => return Ok(()),
            }
        }

        if state.active && last_time_emit.elapsed() >= TIME_EMIT_INTERVAL {
            last_time_emit = Instant::now();
            let pos = state.seek_offset + sink.get_pos().as_secs_f64();
            let _ = app.emit(&topics.time, pos);
        }

        if state.active && sink.empty() {
            state.active = false;
            let _ = app.emit(&topics.pause_state, true);
            let _ = app.emit(&topics.ended, ());
        }

        thread::sleep(TICK_INTERVAL);
    }
}

fn apply(
    app: &AppHandle,
    stream: &OutputStream,
    sink: &mut Sink,
    state: &mut State,
    topics: &Topics,
    cmd: Cmd,
) {
    match cmd {
        Cmd::Load { path, duration } => {
            sink.stop();
            *sink = Sink::connect_new(stream.mixer());
            sink.set_volume(state.volume);
            match decode(&path) {
                Ok((source, decoded_duration)) => {
                    let final_duration = duration.or(decoded_duration);
                    sink.append(source);
                    sink.play();
                    state.active = true;
                    state.current_path = Some(path);
                    state.current_duration = final_duration;
                    state.seek_offset = 0.0;
                    if let Some(d) = final_duration {
                        let _ = app.emit(&topics.duration, d);
                    }
                    let _ = app.emit(&topics.pause_state, false);
                }
                Err(e) => {
                    log::error!("player: decode {} failed: {}", path.display(), e);
                    let _ = app.emit(&topics.error, format!("decode failed: {}", e));
                    state.active = false;
                    state.current_path = None;
                    state.current_duration = None;
                    state.seek_offset = 0.0;
                    let _ = app.emit(&topics.pause_state, true);
                }
            }
        }
        Cmd::Play => {
            sink.play();
            let _ = app.emit(&topics.pause_state, false);
        }
        Cmd::Pause => {
            sink.pause();
            let _ = app.emit(&topics.pause_state, true);
        }
        Cmd::Stop => {
            sink.stop();
            *sink = Sink::connect_new(stream.mixer());
            sink.set_volume(state.volume);
            state.active = false;
            state.current_path = None;
            state.current_duration = None;
            state.seek_offset = 0.0;
            let _ = app.emit(&topics.pause_state, true);
        }
        Cmd::Seek(s) => {
            let target = s.max(0.0);
            let Some(path) = state.current_path.clone() else {
                return;
            };
            let was_paused = sink.is_paused();
            sink.stop();
            *sink = Sink::connect_new(stream.mixer());
            sink.set_volume(state.volume);
            match decode(&path) {
                Ok((mut source, _)) => {
                    let target_dur = Duration::from_secs_f64(target);
                    let actual_offset = match source.try_seek(target_dur) {
                        Ok(()) => target,
                        Err(e) => {
                            log::warn!(
                                "player: container seek failed ({}); skip_duration fallback",
                                e
                            );
                            let skipped = source.skip_duration(target_dur);
                            sink.append(skipped);
                            state.seek_offset = target;
                            state.active = true;
                            if was_paused {
                                sink.pause();
                            } else {
                                sink.play();
                            }
                            return;
                        }
                    };
                    sink.append(source);
                    state.seek_offset = actual_offset;
                    state.active = true;
                    if was_paused {
                        sink.pause();
                    } else {
                        sink.play();
                    }
                }
                Err(e) => {
                    log::error!("player: reload-on-seek failed: {}", e);
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

fn decode(path: &PathBuf) -> Result<(Decoder<BufReader<File>>, Option<f64>)> {
    let file = File::open(path).with_context(|| format!("open {}", path.display()))?;
    let decoder = Decoder::new(BufReader::with_capacity(DECODE_BUFREADER_CAPACITY, file))
        .context("decoder")?;
    let total = decoder.total_duration().map(|d| d.as_secs_f64());
    Ok((decoder, total))
}
