// @vitest-environment node
import { spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AUDIO_EXTENSIONS } from "../../src/main/audio-formats";
import { needsTranscode, transcodeToWav } from "../../src/main/transcode";

const FFMPEG = ffmpegStatic!;

interface FormatSpec {
  ext: string;
  codec: string;
  container?: string;
  sampleRate: number;
}

const FORMATS: FormatSpec[] = [
  { ext: "mp3", codec: "libmp3lame", sampleRate: 44100 },
  { ext: "flac", codec: "flac", sampleRate: 44100 },
  { ext: "wav", codec: "pcm_s16le", sampleRate: 44100 },
  { ext: "ogg", codec: "libvorbis", sampleRate: 44100 },
  { ext: "aac", codec: "aac", container: "adts", sampleRate: 44100 },
  { ext: "m4a", codec: "aac", container: "ipod", sampleRate: 44100 },
  { ext: "wma", codec: "wmav2", container: "asf", sampleRate: 44100 },
  { ext: "opus", codec: "libopus", container: "ogg", sampleRate: 48000 },
  { ext: "aiff", codec: "pcm_s16be", sampleRate: 44100 },
  { ext: "aif", codec: "pcm_s16be", sampleRate: 44100 },
];

let tmp: string;
const fixtures = new Map<string, string>();

async function drain(stream: ReadableStream): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function encode(spec: FormatSpec, outPath: string): void {
  const args = [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=0.2`,
    "-ac",
    "2",
    "-ar",
    String(spec.sampleRate),
    "-acodec",
    spec.codec,
  ];
  if (spec.container) args.push("-f", spec.container);
  args.push(outPath);
  const r = spawnSync(FFMPEG, args, { stdio: "pipe" });
  if (r.status !== 0) {
    throw new Error(
      `encode .${spec.ext} failed (${r.status}): ${r.stderr?.toString()}`,
    );
  }
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "diodedj-transcode-"));
  for (const spec of FORMATS) {
    const p = join(tmp, `sine.${spec.ext}`);
    encode(spec, p);
    fixtures.set(spec.ext, p);
  }
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("AUDIO_EXTENSIONS coverage", () => {
  it("test fixture covers every supported extension", () => {
    const covered = new Set(FORMATS.map((f) => `.${f.ext}`));
    for (const ext of AUDIO_EXTENSIONS) {
      expect(covered.has(ext)).toBe(true);
    }
  });
});

describe("needsTranscode", () => {
  it("returns false for native formats", () => {
    for (const f of ["mp3", "wav", "flac", "ogg", "opus", "aac"]) {
      expect(needsTranscode(f)).toBe(false);
    }
  });

  it("is case-insensitive", () => {
    expect(needsTranscode("MP3")).toBe(false);
    expect(needsTranscode("FLAC")).toBe(false);
    expect(needsTranscode("M4A")).toBe(true);
  });

  it("returns true for non-native formats", () => {
    for (const f of ["m4a", "wma", "aiff", "aif", "weird"]) {
      expect(needsTranscode(f)).toBe(true);
    }
  });
});

describe("transcodeToWav (real ffmpeg, all supported formats)", () => {
  it.each(FORMATS)("produces a valid WAV stream from .$ext", async (spec) => {
    const src = fixtures.get(spec.ext)!;
    const buf = await drain(transcodeToWav(src));

    expect(buf.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(buf.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(buf.subarray(12, 16).toString("ascii")).toBe("fmt ");

    // Output is always normalized to PCM s16le stereo @ 44100Hz
    expect(buf.readUInt16LE(20)).toBe(1); // PCM
    expect(buf.readUInt16LE(22)).toBe(2); // stereo
    expect(buf.readUInt32LE(24)).toBe(44100);
    expect(buf.readUInt16LE(34)).toBe(16);

    // 0.2s @ 44100Hz stereo s16le = 35_280 PCM bytes; allow generous
    // slack for codec priming, sample-rate conversion and trailing silence.
    expect(buf.length).toBeGreaterThan(10_000);
  });

  it("returns an empty/closed stream when source file is invalid", async () => {
    const badPath = join(tmp, "not-audio.bin");
    writeFileSync(badPath, Buffer.from("definitely not audio bytes"));
    const buf = await drain(transcodeToWav(badPath));
    expect(buf.length).toBeLessThan(44);
  });

  it("returns an empty/closed stream when source file does not exist", async () => {
    const buf = await drain(transcodeToWav(join(tmp, "missing.mp3")));
    expect(buf.length).toBeLessThan(44);
  });
});
