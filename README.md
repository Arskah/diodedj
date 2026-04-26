# DiodeDJ

Desktop music player built for radio stations. Manage music, commercials, and jingles with separate libraries, search with instant metadata filtering, and play with automated or manual advance.

## Features

- **Three content libraries** — separate folders and browsing for music, commercials, and jingles
- **Fast search** — full-text search across title, artist, album, and genre (SQLite FTS5)
- **Auto playlist** — toggle continuous random playback with automatic queue refill
- **Playback modes** — AUTO advances through playlist, MANUAL stops after each track
- **Format support** — MP3, FLAC, WAV, OGG, AAC, M4A, Opus natively; WMA, AIFF and others via ffmpeg transcoding
- **Now playing** — real-time display with seekable progress bar, time, and volume

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/)
- [ffmpeg](https://ffmpeg.org/) (for transcoding unsupported audio formats)

## Setup

```bash
pnpm install
pnpm build
pnpm start
```

## Development

```bash
pnpm dev
```

Runs TypeScript watcher, asset watcher, and Electron with auto-reload. DevTools open automatically.

## Stack

- Electron + TypeScript
- better-sqlite3 with FTS5 for metadata indexing
- music-metadata for tag extraction
- ffmpeg for format transcoding
- Husky + lint-staged + ESLint + Prettier + Vitest

## Usage

1. Click **Paths** to configure folders for music, commercials, and jingles
2. Click **Scan** to index audio files and extract metadata
3. Use the **library tabs** to browse by content type
4. Double-click a track or use **+** to add to playlist
5. Toggle **Auto Playlist** for continuous random playback
6. Switch between **AUTO** and **MANUAL** playback modes
