import {
  ChildProcessByStdio,
  spawn as cpSpawn,
  type SpawnOptionsWithStdioTuple,
  type StdioPipe,
  type StdioNull,
} from "child_process";
import { Readable } from "stream";
import portAudio, { type IoStreamWrite } from "naudiodon2";
import ffmpegStatic from "ffmpeg-static";
import { logger } from "../logger";

export type NativePlayerEvent =
  | { type: "time"; seconds: number }
  | { type: "duration"; seconds: number }
  | { type: "pause-state"; paused: boolean }
  | { type: "ended" }
  | { type: "error"; message: string };

export type NativePlayerEventHandler = (event: NativePlayerEvent) => void;

export interface NativePlayerOptions {
  deviceId?: number;
  ffmpegPath?: string;
  audioIoFactory?: typeof portAudio.AudioIO;
  spawn?: typeof cpSpawn;
}

const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 2;
const BYTES_PER_FRAME = BYTES_PER_SAMPLE * CHANNELS;
const TIME_THROTTLE_MS = 100;

const DEFAULT_FFMPEG = (ffmpegStatic ?? "ffmpeg").replace(
  "app.asar",
  "app.asar.unpacked",
);

type DecoderProc = ChildProcessByStdio<null, Readable, Readable>;
type SpawnTriple = SpawnOptionsWithStdioTuple<StdioNull, StdioPipe, StdioPipe>;

export class NativePlayer {
  private output: IoStreamWrite | null = null;
  private decoder: DecoderProc | null = null;
  private handlers = new Set<NativePlayerEventHandler>();
  private paused = false;
  private volume = 1;
  private samplesWritten = 0;
  private startSec = 0;
  private currentDurationSec = 0;
  private currentFile: string | null = null;
  private lastTimeEmit = 0;
  private disposed = false;
  private readonly ffmpegPath: string;
  private readonly audioIoFactory: typeof portAudio.AudioIO;
  private readonly spawn: typeof cpSpawn;

  constructor(private options: NativePlayerOptions = {}) {
    this.ffmpegPath = options.ffmpegPath ?? DEFAULT_FFMPEG;
    this.audioIoFactory = options.audioIoFactory ?? portAudio.AudioIO;
    this.spawn = options.spawn ?? cpSpawn;
  }

  start(): void {
    if (this.output) return;
    this.output = this.audioIoFactory({
      outOptions: {
        channelCount: CHANNELS,
        sampleFormat: portAudio.SampleFormat16Bit,
        sampleRate: SAMPLE_RATE,
        deviceId: this.options.deviceId ?? -1,
        closeOnError: false,
      },
    }) as IoStreamWrite;
    this.output.on("error", (err: Error) => {
      logger.error("portaudio error", err);
      this.emit({ type: "error", message: err.message });
    });
    this.output.start();
  }

  on(handler: NativePlayerEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  // durationSec is provided by the caller (from the DB-backed track row)
  // since we'd otherwise need an ffprobe call to get it.
  async load(filePath: string, durationSec: number): Promise<void> {
    this.killDecoder();
    this.currentFile = filePath;
    this.currentDurationSec = durationSec;
    this.samplesWritten = 0;
    this.startSec = 0;
    this.paused = false;
    this.emit({ type: "duration", seconds: durationSec });
    this.spawnDecoder(filePath, 0);
    this.emit({ type: "pause-state", paused: false });
  }

  async play(): Promise<void> {
    if (!this.paused) return;
    this.paused = false;
    this.decoder?.stdout.resume();
    this.emit({ type: "pause-state", paused: false });
  }

  async pause(): Promise<void> {
    if (this.paused) return;
    this.paused = true;
    this.decoder?.stdout.pause();
    this.emit({ type: "pause-state", paused: true });
  }

  async stop(): Promise<void> {
    this.killDecoder();
    this.currentFile = null;
    this.samplesWritten = 0;
    this.startSec = 0;
    this.paused = true;
    this.emit({ type: "pause-state", paused: true });
  }

  async seek(seconds: number): Promise<void> {
    if (!this.currentFile) return;
    const file = this.currentFile;
    const dur = this.currentDurationSec;
    const target = Math.max(0, Math.min(dur, seconds));
    this.killDecoder();
    this.startSec = target;
    this.samplesWritten = 0;
    this.spawnDecoder(file, target);
    this.emit({ type: "time", seconds: target });
  }

  async setVolume(volume: number): Promise<void> {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.killDecoder();
    if (this.output) {
      try {
        this.output.quit();
      } catch (err) {
        logger.warn("portaudio quit error", err);
      }
      this.output = null;
    }
    this.handlers.clear();
  }

  private spawnDecoder(filePath: string, startSec: number): void {
    const args = [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      ...(startSec > 0 ? ["-ss", startSec.toFixed(6)] : []),
      "-i",
      filePath,
      "-f",
      "s16le",
      "-acodec",
      "pcm_s16le",
      "-ar",
      String(SAMPLE_RATE),
      "-ac",
      String(CHANNELS),
      "pipe:1",
    ];
    const opts: SpawnTriple = {
      stdio: ["ignore", "pipe", "pipe"],
    };
    const proc = this.spawn(this.ffmpegPath, args, opts) as DecoderProc;
    this.decoder = proc;

    proc.stdout.on("data", (chunk: Buffer) => this.feedSamples(chunk));
    proc.stdout.on("end", () => {
      this.emit({ type: "ended" });
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      logger.warn(`[ffmpeg] ${chunk.toString().trim()}`);
    });
    proc.on("error", (err) => {
      logger.error("ffmpeg spawn error", err);
      this.emit({ type: "error", message: err.message });
    });
    proc.on("exit", (code, signal) => {
      logger.verbose(`ffmpeg exit code=${code} signal=${signal}`);
    });
  }

  private feedSamples(chunk: Buffer): void {
    if (!this.output) return;
    if (this.volume !== 1) {
      this.applyVolume(chunk);
    }
    const ok = this.output.write(chunk);
    this.samplesWritten += chunk.length / BYTES_PER_FRAME;
    if (!ok && this.decoder) {
      this.decoder.stdout.pause();
      this.output.once("drain", () => {
        if (!this.paused) this.decoder?.stdout.resume();
      });
    }
    this.maybeEmitTime();
  }

  private applyVolume(chunk: Buffer): void {
    const samples = new Int16Array(
      chunk.buffer,
      chunk.byteOffset,
      chunk.byteLength / BYTES_PER_SAMPLE,
    );
    const v = this.volume;
    for (let i = 0; i < samples.length; i++) {
      const scaled = Math.round(samples[i] * v);
      samples[i] = scaled < -32768 ? -32768 : scaled > 32767 ? 32767 : scaled;
    }
  }

  private maybeEmitTime(): void {
    const now = Date.now();
    if (now - this.lastTimeEmit < TIME_THROTTLE_MS) return;
    this.lastTimeEmit = now;
    const seconds = this.startSec + this.samplesWritten / SAMPLE_RATE;
    this.emit({ type: "time", seconds });
  }

  private killDecoder(): void {
    if (this.decoder) {
      try {
        this.decoder.kill("SIGTERM");
      } catch {
        // already dead
      }
      this.decoder = null;
    }
  }

  private emit(event: NativePlayerEvent): void {
    for (const h of this.handlers) h(event);
  }
}
