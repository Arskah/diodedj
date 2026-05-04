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
    Load { path: PathBuf, duration: Option<f64> },
    Play,
    Pause,
    Stop,
    Seek(f64),
    SetVolume(f32),
}

pub struct PlayerHandle {
    tx: Sender<Cmd>,
}

impl PlayerHandle {
    pub fn spawn(app: AppHandle) -> Self {
        let (tx, rx) = channel();
        thread::spawn(move || {
            if let Err(e) = run(app.clone(), rx) {
                log::error!("player thread exited: {}", e);
                let _ = app.emit("player:error", e.to_string());
            }
        });
        Self { tx }
    }

    pub fn send(&self, cmd: Cmd) {
        let _ = self.tx.send(cmd);
    }
}

fn run(app: AppHandle, rx: std::sync::mpsc::Receiver<Cmd>) -> Result<()> {
    let stream: OutputStream =
        OutputStreamBuilder::open_default_stream().context("open default audio stream")?;
    let mut sink = Sink::connect_new(stream.mixer());
    let mut last_time_emit = Instant::now()
        .checked_sub(TIME_EMIT_INTERVAL)
        .unwrap_or_else(Instant::now);
    let mut last_paused = sink.is_paused();
    let mut active = false;
    let mut current_volume: f32 = 1.0;

    loop {
        loop {
            match rx.try_recv() {
                Ok(cmd) => apply(
                    &app,
                    &stream,
                    &mut sink,
                    &mut active,
                    &mut current_volume,
                    cmd,
                ),
                Err(std::sync::mpsc::TryRecvError::Empty) => break,
                Err(std::sync::mpsc::TryRecvError::Disconnected) => return Ok(()),
            }
        }

        let paused_now = sink.is_paused();
        if paused_now != last_paused {
            last_paused = paused_now;
            let _ = app.emit("player:pause-state", paused_now);
        }

        if active && last_time_emit.elapsed() >= TIME_EMIT_INTERVAL {
            last_time_emit = Instant::now();
            let pos = sink.get_pos().as_secs_f64();
            let _ = app.emit("player:time", pos);
        }

        if active && sink.empty() {
            active = false;
            let _ = app.emit("player:ended", ());
        }

        thread::sleep(TICK_INTERVAL);
    }
}

fn apply(
    app: &AppHandle,
    stream: &OutputStream,
    sink: &mut Sink,
    active: &mut bool,
    volume: &mut f32,
    cmd: Cmd,
) {
    match cmd {
        Cmd::Load { path, duration } => {
            sink.stop();
            *sink = Sink::connect_new(stream.mixer());
            sink.set_volume(*volume);
            match decode(&path) {
                Ok((source, decoded_duration)) => {
                    let final_duration = duration.or(decoded_duration);
                    sink.append(source);
                    sink.play();
                    *active = true;
                    if let Some(d) = final_duration {
                        let _ = app.emit("player:duration", d);
                    }
                }
                Err(e) => {
                    log::error!("player: decode {} failed: {}", path.display(), e);
                    let _ = app.emit("player:error", format!("decode failed: {}", e));
                    *active = false;
                }
            }
        }
        Cmd::Play => sink.play(),
        Cmd::Pause => sink.pause(),
        Cmd::Stop => {
            sink.stop();
            *sink = Sink::connect_new(stream.mixer());
            sink.set_volume(*volume);
            *active = false;
        }
        Cmd::Seek(s) => {
            if let Err(e) = sink.try_seek(Duration::from_secs_f64(s.max(0.0))) {
                log::warn!("player: seek failed: {}", e);
            }
        }
        Cmd::SetVolume(v) => {
            let clamped = v.clamp(0.0, 1.0);
            *volume = clamped;
            sink.set_volume(clamped);
        }
    }
}

fn decode(path: &PathBuf) -> Result<(Decoder<BufReader<File>>, Option<f64>)> {
    let file = File::open(path).with_context(|| format!("open {}", path.display()))?;
    let decoder = Decoder::new(BufReader::new(file)).context("decoder")?;
    let total = decoder.total_duration().map(|d| d.as_secs_f64());
    Ok((decoder, total))
}
