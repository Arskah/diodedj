import { spawn } from "child_process";
import { Readable } from "stream";

const NATIVE_FORMATS = new Set([
  "mp3",
  "wav",
  "flac",
  "ogg",
  "opus",
  "aac",
  "m4a",
]);

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
    { stdio: ["ignore", "pipe", "ignore"] },
  );

  return Readable.toWeb(proc.stdout!) as ReadableStream;
}
