export const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".flac",
  ".wav",
  ".ogg",
  ".oga",
  ".aac",
  ".m4a",
  ".wma",
  ".opus",
  ".webm",
  ".aiff",
  ".aif",
  ".mka",
  ".mp2",
]);

export const MIME_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  mp2: "audio/mpeg",
  m4a: 'audio/mp4; codecs="mp4a.40.2"',
  mp4: 'audio/mp4; codecs="mp4a.40.2"',
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  flac: "audio/flac",
  webm: "audio/webm",
  mka: "audio/x-matroska",
};

// Formats Chromium plays directly via <audio> + Range. m4a/mp4 are NOT
// listed here because their playability depends on whether the moov atom
// precedes mdat (faststart) — that runtime check lives in
// transcode.ts:shouldTranscode.
export const NATIVE_FORMATS = new Set([
  "mp3",
  "wav",
  "flac",
  "ogg",
  "oga",
  "opus",
  "aac",
  "webm",
]);
