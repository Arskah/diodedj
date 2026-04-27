import { spawn } from "child_process";
import { open } from "fs/promises";
import { Readable } from "stream";
import ffmpegStatic from "ffmpeg-static";
import { NATIVE_FORMATS } from "./audio-formats";

// Packaged app: ffmpeg binary lives in app.asar.unpacked, not app.asar
const FFMPEG_PATH =
  ffmpegStatic?.replace("app.asar", "app.asar.unpacked") ?? "ffmpeg";

const MP4_FORMATS = new Set(["m4a", "mp4"]);
const MOOV_SCAN_BYTES = 64 * 1024;

// Transcode output format: PCM s16le stereo @ 44100Hz
const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 2;
const BYTES_PER_FRAME = CHANNELS * BYTES_PER_SAMPLE;
const PCM_BYTES_PER_SECOND = SAMPLE_RATE * BYTES_PER_FRAME;
export const WAV_HEADER_SIZE = 44;

export function needsTranscode(format: string): boolean {
  return !NATIVE_FORMATS.has(format.toLowerCase());
}

// MP4 files are streamable by Chromium only when the 'moov' atom precedes
// 'mdat' (faststart layout). Files with moov-at-end fail mid-playback even
// with byte-correct Range responses, so we transcode those.
export async function isMp4FastStart(filePath: string): Promise<boolean> {
  let fd;
  try {
    fd = await open(filePath, "r");
  } catch {
    return false;
  }
  try {
    const buf = Buffer.alloc(MOOV_SCAN_BYTES);
    const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
    let offset = 0;
    while (offset + 8 <= bytesRead) {
      const size = buf.readUInt32BE(offset);
      const type = buf.toString("ascii", offset + 4, offset + 8);
      if (type === "moov") return true;
      if (type === "mdat") return false;
      let advance: number;
      if (size === 0) return false; // atom extends to EOF — moov not seen
      if (size === 1) {
        if (offset + 16 > bytesRead) return false;
        const hi = buf.readUInt32BE(offset + 8);
        const lo = buf.readUInt32BE(offset + 12);
        advance = hi * 0x1_0000_0000 + lo;
      } else {
        advance = size;
      }
      if (advance < 8) return false; // malformed
      offset += advance;
    }
    return false;
  } finally {
    await fd.close();
  }
}

export async function shouldTranscode(
  format: string,
  filePath: string,
): Promise<boolean> {
  const fmt = format.toLowerCase();
  if (MP4_FORMATS.has(fmt)) return !(await isMp4FastStart(filePath));
  return needsTranscode(fmt);
}

export function pcmBytesForDuration(durationSeconds: number): number {
  // Round down to whole sample frames (4 bytes for s16le stereo).
  return (
    Math.floor((durationSeconds * PCM_BYTES_PER_SECOND) / BYTES_PER_FRAME) *
    BYTES_PER_FRAME
  );
}

export function transcodedTotalSize(durationSeconds: number): number {
  return WAV_HEADER_SIZE + pcmBytesForDuration(durationSeconds);
}

export function buildWavHeader(pcmBytes: number): Buffer {
  const buf = Buffer.alloc(WAV_HEADER_SIZE);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + pcmBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // fmt chunk body size
  buf.writeUInt16LE(1, 20); // PCM format
  buf.writeUInt16LE(CHANNELS, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(PCM_BYTES_PER_SECOND, 28);
  buf.writeUInt16LE(BYTES_PER_FRAME, 32);
  buf.writeUInt16LE(BYTES_PER_SAMPLE * 8, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(pcmBytes, 40);
  return buf;
}

function attachFfmpegLogging(
  proc: ReturnType<typeof spawn>,
  filePath: string,
): void {
  proc.stderr!.on("data", (chunk: Buffer) => {
    process.stderr.write(`[ffmpeg ${filePath}] ${chunk}`);
  });
  proc.on("error", (err) => {
    console.error(`[ffmpeg spawn error] ${filePath}:`, err);
  });
  proc.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`[ffmpeg exit ${code}] ${filePath} signal=${signal}`);
    }
  });
}

const FFMPEG_QUIET = ["-nostdin", "-hide_banner", "-loglevel", "error"];

// Spawns ffmpeg with input-side seek and outputs raw PCM s16le.
function spawnPcmDecoder(
  filePath: string,
  seekSeconds: number,
): ReturnType<typeof spawn> {
  const args = [...FFMPEG_QUIET];
  if (seekSeconds > 0) args.push("-ss", seekSeconds.toFixed(6));
  args.push(
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
  );
  const proc = spawn(FFMPEG_PATH, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
  attachFfmpegLogging(proc, filePath);
  return proc;
}

// Returns up to pcmLengthBytes of raw PCM starting at pcmOffsetBytes.
// Pads with zero-filled silence if the source ends before the requested
// length, so callers can honor a precomputed Content-Length.
function pcmRangeStream(
  filePath: string,
  pcmOffsetBytes: number,
  pcmLengthBytes: number,
): ReadableStream {
  const seekSeconds = pcmOffsetBytes / PCM_BYTES_PER_SECOND;
  const proc = spawnPcmDecoder(filePath, seekSeconds);
  let remaining = pcmLengthBytes;
  let closed = false;
  const close = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (closed) return;
    closed = true;
    try {
      controller.close();
    } catch {
      /* already closed */
    }
  };

  // Pads with zero-filled silence on EOF or stream error so the response
  // body always matches the promised Content-Length. Otherwise Chromium
  // reports PIPELINE_ERROR_READ on short reads.
  const finish = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (closed) return;
    if (remaining > 0) {
      controller.enqueue(new Uint8Array(remaining));
      remaining = 0;
    }
    close(controller);
  };

  // Backpressure: ffmpeg can dump tens of MB into the pipe in <100ms.
  // Without flow control, the entire body queues into the ReadableStream
  // buffer and Electron's protocol pipe sees close() before downstream
  // drains, surfacing as Chromium PIPELINE_ERROR_READ. We pause stdout
  // when the controller's queue is full and resume from `pull`.
  return new ReadableStream<Uint8Array>({
    start(controller) {
      proc.stdout!.on("data", (chunk: Buffer) => {
        if (closed || remaining <= 0) return;
        const slice =
          chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
        controller.enqueue(new Uint8Array(slice));
        remaining -= slice.length;
        if (remaining <= 0) {
          close(controller);
          proc.kill("SIGTERM");
          return;
        }
        if ((controller.desiredSize ?? 0) <= 0) {
          proc.stdout!.pause();
        }
      });
      proc.stdout!.on("end", () => finish(controller));
      proc.stdout!.on("error", (err) => {
        console.error(`[ffmpeg stdout error] ${filePath}:`, err);
        finish(controller);
      });
      proc.on("error", () => finish(controller));
      proc.on("exit", () => {
        if (!closed && remaining > 0) finish(controller);
      });
    },
    pull() {
      if (!closed && proc.stdout!.isPaused()) proc.stdout!.resume();
    },
    cancel() {
      proc.kill("SIGTERM");
    },
  });
}

// Returns a ReadableStream covering byte range [start, end] of the
// virtual transcoded WAV file (header + PCM).
export function transcodeRange(
  filePath: string,
  durationSeconds: number,
  start: number,
  end: number,
): ReadableStream {
  const pcmTotal = pcmBytesForDuration(durationSeconds);
  const header = buildWavHeader(pcmTotal);

  const headerSlice =
    start < WAV_HEADER_SIZE
      ? header.subarray(start, Math.min(WAV_HEADER_SIZE, end + 1))
      : Buffer.alloc(0);

  const pcmStart = Math.max(0, start - WAV_HEADER_SIZE);
  const pcmEnd = end - WAV_HEADER_SIZE;
  const pcmLength = pcmEnd >= 0 ? pcmEnd - pcmStart + 1 : 0;

  if (pcmLength <= 0) {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        if (headerSlice.length) controller.enqueue(new Uint8Array(headerSlice));
        controller.close();
      },
    });
  }

  const pcm = pcmRangeStream(filePath, pcmStart, pcmLength);
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      if (headerSlice.length) controller.enqueue(new Uint8Array(headerSlice));
      const reader = pcm.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

export function transcodeToWav(filePath: string): ReadableStream {
  const proc = spawn(
    FFMPEG_PATH,
    [
      ...FFMPEG_QUIET,
      "-i",
      filePath,
      "-f",
      "wav",
      "-acodec",
      "pcm_s16le",
      "-ar",
      String(SAMPLE_RATE),
      "-ac",
      String(CHANNELS),
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  attachFfmpegLogging(proc, filePath);
  return Readable.toWeb(proc.stdout!) as ReadableStream;
}
