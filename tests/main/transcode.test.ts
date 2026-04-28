import { spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AUDIO_EXTENSIONS } from "../../src/main/audio-formats";
import {
  buildWavHeader,
  isMp4FastStart,
  needsTranscode,
  pcmBytesForDuration,
  shouldTranscode,
  transcodeRange,
  transcodeToWav,
  transcodedTotalSize,
  WAV_HEADER_SIZE,
} from "../../src/main/transcode";

const FFMPEG = ffmpegStatic!;

interface FormatSpec {
  ext: string;
  codec: string;
  container?: string;
  sampleRate: number;
  extraArgs?: string[];
}

const FORMATS: FormatSpec[] = [
  { ext: "mp3", codec: "libmp3lame", sampleRate: 44100 },
  { ext: "flac", codec: "flac", sampleRate: 44100 },
  { ext: "wav", codec: "pcm_s16le", sampleRate: 44100 },
  { ext: "ogg", codec: "libvorbis", sampleRate: 44100 },
  { ext: "oga", codec: "libvorbis", container: "ogg", sampleRate: 44100 },
  { ext: "aac", codec: "aac", container: "adts", sampleRate: 44100 },
  // m4a fixture is faststart so isMp4FastStart returns true; the
  // transcodeToWav check below works regardless of layout.
  {
    ext: "m4a",
    codec: "aac",
    container: "ipod",
    sampleRate: 44100,
    extraArgs: ["-movflags", "+faststart"],
  },
  { ext: "wma", codec: "wmav2", container: "asf", sampleRate: 44100 },
  { ext: "opus", codec: "libopus", container: "ogg", sampleRate: 48000 },
  { ext: "webm", codec: "libopus", container: "webm", sampleRate: 48000 },
  { ext: "aiff", codec: "pcm_s16be", sampleRate: 44100 },
  { ext: "aif", codec: "pcm_s16be", sampleRate: 44100 },
  { ext: "mka", codec: "libvorbis", container: "matroska", sampleRate: 44100 },
  { ext: "mp2", codec: "mp2", container: "mp2", sampleRate: 44100 },
];

const NATIVE_EXTS = new Set([
  "mp3",
  "wav",
  "flac",
  "ogg",
  "oga",
  "opus",
  "aac",
  "webm",
]);

let tmp: string;
const fixtures = new Map<string, string>();
let m4aFastStart: string;
let m4aSlow: string;

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
  if (spec.extraArgs) args.push(...spec.extraArgs);
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
  m4aFastStart = fixtures.get("m4a")!;
  m4aSlow = join(tmp, "moov-at-end.m4a");
  encode(
    {
      ext: "m4a",
      codec: "aac",
      container: "ipod",
      sampleRate: 44100,
    },
    m4aSlow,
  );
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
  it("returns false for Chromium-native formats", () => {
    for (const f of NATIVE_EXTS) {
      expect(needsTranscode(f)).toBe(false);
    }
  });

  it("is case-insensitive", () => {
    expect(needsTranscode("MP3")).toBe(false);
    expect(needsTranscode("WEBM")).toBe(false);
    expect(needsTranscode("WMA")).toBe(true);
  });

  it("returns true for non-native formats including m4a", () => {
    // m4a/mp4 require a runtime moov-position check (shouldTranscode);
    // by extension alone they default to "transcode".
    for (const f of ["m4a", "mp4", "wma", "aiff", "aif", "mka", "mp2"]) {
      expect(needsTranscode(f)).toBe(true);
    }
  });
});

describe("isMp4FastStart", () => {
  it("returns true when moov precedes mdat", async () => {
    expect(await isMp4FastStart(m4aFastStart)).toBe(true);
  });

  it("returns false when mdat precedes moov", async () => {
    expect(await isMp4FastStart(m4aSlow)).toBe(false);
  });

  it("returns false on missing files", async () => {
    expect(await isMp4FastStart(join(tmp, "ghost.m4a"))).toBe(false);
  });

  it("returns false on non-MP4 input", async () => {
    expect(await isMp4FastStart(fixtures.get("mp3")!)).toBe(false);
  });
});

describe("shouldTranscode", () => {
  it("skips transcode for Chromium-native formats", async () => {
    for (const ext of NATIVE_EXTS) {
      expect(await shouldTranscode(ext, fixtures.get(ext)!)).toBe(false);
    }
  });

  it("requires transcode for wma / aiff / mka / mp2", async () => {
    for (const ext of ["wma", "aiff", "aif", "mka", "mp2"]) {
      expect(await shouldTranscode(ext, fixtures.get(ext)!)).toBe(true);
    }
  });

  it("skips transcode for faststart m4a", async () => {
    expect(await shouldTranscode("m4a", m4aFastStart)).toBe(false);
  });

  it("requires transcode for moov-at-end m4a", async () => {
    expect(await shouldTranscode("m4a", m4aSlow)).toBe(true);
  });

  it("is case-insensitive on the format string", async () => {
    expect(await shouldTranscode("M4A", m4aFastStart)).toBe(false);
    expect(await shouldTranscode("WMA", fixtures.get("wma")!)).toBe(true);
  });
});

describe("pcmBytesForDuration / transcodedTotalSize", () => {
  it("computes zero PCM for zero duration", () => {
    expect(pcmBytesForDuration(0)).toBe(0);
    expect(transcodedTotalSize(0)).toBe(WAV_HEADER_SIZE);
  });

  it("uses 176400 bytes per second for stereo s16le @ 44100Hz", () => {
    expect(pcmBytesForDuration(1)).toBe(176_400);
    expect(transcodedTotalSize(1)).toBe(WAV_HEADER_SIZE + 176_400);
  });

  it("rounds down to whole sample frames (4 bytes)", () => {
    // 1 sample = 1/44100s; pick a duration whose raw byte count is not
    // 4-aligned and confirm it's truncated to a frame boundary.
    const d = 0.0001;
    const raw = d * 176_400; // ≈ 17.64
    expect(pcmBytesForDuration(d) % 4).toBe(0);
    expect(pcmBytesForDuration(d)).toBeLessThanOrEqual(raw);
  });
});

describe("buildWavHeader", () => {
  it("produces a valid 44-byte RIFF/WAVE/fmt/data header", () => {
    const pcm = 176_400;
    const h = buildWavHeader(pcm);
    expect(h.length).toBe(WAV_HEADER_SIZE);
    expect(h.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(h.readUInt32LE(4)).toBe(36 + pcm);
    expect(h.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(h.subarray(12, 16).toString("ascii")).toBe("fmt ");
    expect(h.readUInt32LE(16)).toBe(16);
    expect(h.readUInt16LE(20)).toBe(1); // PCM
    expect(h.readUInt16LE(22)).toBe(2); // stereo
    expect(h.readUInt32LE(24)).toBe(44100);
    expect(h.readUInt32LE(28)).toBe(176_400); // byte rate
    expect(h.readUInt16LE(32)).toBe(4); // block align
    expect(h.readUInt16LE(34)).toBe(16); // bits per sample
    expect(h.subarray(36, 40).toString("ascii")).toBe("data");
    expect(h.readUInt32LE(40)).toBe(pcm);
  });
});

describe("transcodeRange (Range/seek support)", () => {
  // 0.2s sine fixture used for transcode tests; use it as the source.
  const DURATION = 0.2;
  const TOTAL_PCM = 0.2 * 176_400; // 35_280
  const TOTAL = WAV_HEADER_SIZE + TOTAL_PCM; // 35_324

  it("returns total size matching transcodedTotalSize", () => {
    expect(transcodedTotalSize(DURATION)).toBe(TOTAL);
  });

  it("range covering only the WAV header returns header bytes", async () => {
    const src = fixtures.get("mp3")!;
    const buf = await drain(transcodeRange(src, DURATION, 0, 43));
    expect(buf.length).toBe(44);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(buf.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(buf.readUInt32LE(40)).toBe(TOTAL_PCM);
  });

  it("range covering only PCM returns exactly the requested length", async () => {
    const src = fixtures.get("mp3")!;
    const start = 1000;
    const end = 5000;
    const buf = await drain(transcodeRange(src, DURATION, start, end));
    expect(buf.length).toBe(end - start + 1);
  });

  it("range straddling header/PCM boundary splices both sections", async () => {
    const src = fixtures.get("mp3")!;
    const start = 40;
    const end = 200;
    const buf = await drain(transcodeRange(src, DURATION, start, end));
    expect(buf.length).toBe(end - start + 1);
    // First 4 bytes are the tail of the data-size field (offset 40..43)
    // followed by PCM samples.
    expect(buf.readUInt32LE(0)).toBe(TOTAL_PCM);
  });

  it("full-file range produces a valid playable WAV", async () => {
    const src = fixtures.get("mp3")!;
    const buf = await drain(transcodeRange(src, DURATION, 0, TOTAL - 1));
    expect(buf.length).toBe(TOTAL);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(buf.subarray(8, 12).toString("ascii")).toBe("WAVE");
    // PCM body should be non-silent (sine wave) for at least part of it.
    const pcm = buf.subarray(WAV_HEADER_SIZE);
    const nonZero = pcm.some((b) => b !== 0);
    expect(nonZero).toBe(true);
  });

  it("pads with silence when source ends short of the requested length", async () => {
    const src = fixtures.get("mp3")!;
    // Claim a 2-second duration for a 0.2s source. Request the second
    // half (mostly past EOF). pcmRangeStream must zero-pad to match
    // the promised Content-Length.
    const fakeDuration = 2;
    const fakeTotal = transcodedTotalSize(fakeDuration);
    const start = Math.floor(fakeTotal * 0.6);
    const end = fakeTotal - 1;
    const buf = await drain(transcodeRange(src, fakeDuration, start, end));
    expect(buf.length).toBe(end - start + 1);
  });

  it("returns deterministic byte length regardless of seek position", async () => {
    const src = fixtures.get("mp3")!;
    for (const start of [0, 100, WAV_HEADER_SIZE, 1024, 8192]) {
      const end = Math.min(start + 4095, TOTAL - 1);
      const buf = await drain(transcodeRange(src, DURATION, start, end));
      expect(buf.length).toBe(end - start + 1);
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
