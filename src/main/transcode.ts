import { spawn } from "child_process";
import { Readable } from "stream";
import ffmpegStatic from "ffmpeg-static";
import { NATIVE_FORMATS } from "./audio-formats";

// Packaged app: ffmpeg binary lives in app.asar.unpacked, not app.asar
const FFMPEG_PATH =
  ffmpegStatic?.replace("app.asar", "app.asar.unpacked") ?? "ffmpeg";

export function needsTranscode(format: string): boolean {
  return !NATIVE_FORMATS.has(format.toLowerCase());
}

export function transcodeToWav(filePath: string): ReadableStream {
  const proc = spawn(
    FFMPEG_PATH,
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
