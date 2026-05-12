# DiodeDJ

Desktop music player built for radio stations. Manage music, commercials, and jingles with separate libraries, search with instant metadata filtering, and play with automated or manual advance.

## Features

- **Three content libraries** — separate folders and browsing for music, commercials, and jingles
- **Fast search** — full-text search across title, artist, album, and genre (SQLite FTS5)
- **Auto playlist** — toggle continuous random playback with automatic queue refill
- **Playback modes** — AUTO advances through playlist, MANUAL stops after each track
- **Native audio** — in-process Rust player (rodio + symphonia) for MP3, FLAC, Vorbis, WAV, AAC, M4A. No browser audio pipeline, no external transcoder
- **Now playing** — real-time display with seekable progress bar, time, and volume

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/)
- [Rust toolchain](https://rustup.rs/) (stable)
- Linux only: `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev libasound2-dev`

## Development

```bash
pnpm install
pnpm dev          # tauri dev — Vite HMR for renderer, cargo watch for backend
```

## Build

```bash
pnpm build        # tauri build — produces platform bundles in src-tauri/target/release/bundle/
```

## Tests

```bash
pnpm test -- run                                            # 62 vitest renderer tests
cargo test --manifest-path src-tauri/Cargo.toml             # 24 cargo backend tests
pnpm typecheck && pnpm lint                                 # tsc + svelte-check + eslint
```

## Logs

DiodeDJ writes a rotating log file (`DiodeDJ.log`, 1 MB max, one prior file kept).

- macOS: `~/Library/Logs/com.diodedj.app/DiodeDJ.log`
- Linux: `~/.local/share/com.diodedj.app/logs/DiodeDJ.log` (or `$XDG_DATA_HOME/com.diodedj.app/logs/`)
- Windows: `%LOCALAPPDATA%\com.diodedj.app\logs\DiodeDJ.log`

Set `RUST_LOG=debug` (or `trace`) before launching to raise verbosity. Default is `info` (release) or `debug` (dev).

## Stack

- Tauri 2 + Svelte 5 + Vite (renderer)
- Rust backend: `rusqlite` (FTS5), `rodio` + `symphonia`, `lofty` for tag metadata, `walkdir` for filesystem scan, `parking_lot` for sync primitives
- Husky + lint-staged + ESLint + Prettier + Vitest

## Usage

1. Click **Paths** to configure folders for music, commercials, and jingles
2. Click **Scan** to index audio files and extract metadata
3. Use the **library tabs** to browse by content type
4. Double-click a track or use **+** to add to playlist
5. Toggle **Auto Playlist** for continuous random playback
6. Switch between **AUTO** and **MANUAL** playback modes
