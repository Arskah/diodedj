import { spawn } from "child_process";
import { Readable } from "stream";

// Formats Chromium plays directly via <audio> + our protocol handler.
// m4a/mp4 excluded: Chromium's pipeline rejects our Range responses for moov-at-end
// containers even when bytes match. Route through ffmpeg → wav instead.
const NATIVE_FORMATS = new Set(["mp3", "wav", "flac", "ogg", "opus", "aac"]);

export function needsTranscode(format: string): boolean {
  return !NATIVE_FORMATS.has(format.toLowerCase());
}

export function transcodeToWav(filePath: string): ReadableStream {
  const proc = spawn(
    "ffmpeg",
    [
      "-i",
      filePath,
      "-f",
      "wav",
      "-acodec",
      "pcm_s16le",
      "-ar",
      "44100",
      "-ac",
      "2",
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

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

  return Readable.toWeb(proc.stdout!) as ReadableStream;
}
