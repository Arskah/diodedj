export const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".flac",
  ".wav",
  ".ogg",
  ".aac",
  ".m4a",
  ".wma",
  ".opus",
  ".aiff",
  ".aif",
]);

export const MIME_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: 'audio/mp4; codecs="mp4a.40.2"',
  mp4: 'audio/mp4; codecs="mp4a.40.2"',
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  flac: "audio/flac",
  webm: "audio/webm",
};

// m4a/mp4 excluded: Chromium's pipeline rejects our Range responses for moov-at-end
// containers even when bytes match. Route through ffmpeg → wav instead.
export const NATIVE_FORMATS = new Set([
  "mp3",
  "wav",
  "flac",
  "ogg",
  "opus",
  "aac",
]);
