# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
pnpm dev                                          # tauri dev (Vite HMR for renderer, cargo watch for backend)
pnpm build                                        # tauri build → src-tauri/target/release/bundle/<format>/
pnpm typecheck                                    # svelte-check + tsc on tsconfig.node.json
pnpm test                                         # vitest watch
pnpm test -- run                                  # vitest single run (62 renderer tests)
cargo test --manifest-path src-tauri/Cargo.toml   # 24 backend tests (db, scanner, session, playlist, config)
pnpm lint                                         # eslint
pnpm format                                       # prettier --write .
pnpm format:check                                 # prettier --check .
```

Pre-commit hook runs lint-staged (prettier + eslint fix) then vitest.

CI gates Rust with `cargo fmt --check` + `cargo clippy --all-targets -- -D warnings` (`.github/workflows/rust.yml`); run both locally before pushing.

## Architecture

Tauri 2 app. Two process boundaries: a Rust backend and a Svelte 5 / Vite renderer talking over Tauri `invoke` + `emit`/`listen`.

**Rust backend** (`src-tauri/src/`):

- `lib.rs` — `tauri::Builder` setup, `AppState`, all `#[tauri::command]` handlers
- `main.rs` — thin `pub fn main() { diodedj_lib::run() }` binary entry
- `db.rs` — `rusqlite` with FTS5 full-text search, WAL mode, `parking_lot::Mutex<Connection>`, `user_version` migrations
- `scanner.rs` + `scan_state.rs` — recursive walkdir scan, `lofty` tag extraction, mtime+content_type delta cache, background worker thread emitting `scan-progress` / `scan-state-changed` events with cancel token
- `config.rs` — `AppConfig` (camelCase serde) persisted to `{app_data_dir}/config.json`
- `session.rs` — `SessionState` (camelCase serde, per-field defaults) persisted to `{app_data_dir}/session.json`
- `playlist.rs` — random selection with jingle/commercial interleaving (every-4 / every-8)
- `player.rs` — rodio `Sink` on a worker thread driven by `mpsc::Sender<Cmd>`; symphonia decoders for mp3/flac/vorbis/wav/aac/m4a; emits `player:time` (10 Hz) / `player:duration` / `player:pause-state` / `player:ended` / `player:error`
- `audio_formats.rs` — supported extension table

**Renderer** (`src/renderer/`):

- `main.ts` — app entry; mounts Svelte, hooks Tauri `onCloseRequested` to await `flushSave()` before `win.destroy()`
- `App.svelte` + `components/*.svelte` — UI tree
- `state.svelte.ts` — Svelte 5 `$state` store, talks to backend via the `PlayerBackend` interface
- `player/backend.ts` — `PlayerBackend` interface, `player/nativeBackend.ts` — Tauri `invoke` + `listen` impl
- `api.ts` — typed `invoke()` wrapper for every backend command (folder picker via `@tauri-apps/plugin-dialog`)

## Key Patterns

**Audio playback:** in-process Rust player. Renderer calls `player_load(trackId)`; the Rust worker thread decodes via symphonia, emits time/duration/pause-state/ended/error events. No browser `<audio>` element, no `media://` protocol, no transcoder.

**Search:** FTS5 virtual table on title/artist/album/genre. Triggers keep FTS in sync with tracks table. Query tokenized as prefix match: `foo bar` → `"foo"* "bar"*`.

**Scan + prune:** On scan, the scan worker walks the configured paths, deletes DB rows whose path no longer falls under any configured library path, then upserts present files. Empty paths array → all tracks deleted.

**Auto-playlist:** Toggle mode that maintains a 5-track lookahead buffer. Refills from random DB selection when running low.

**Seek:** `player.rs` reloads the source on seek and prefers `Source::try_seek` (container-level binary search). Fallback is `skip_duration` (sample iteration). `seek_offset + sink.get_pos()` keeps `player:time` accurate.

## Gotchas

- `tauri::generate_context!()` runs at compile time and validates `frontendDist=../dist`. `cargo clippy` / `cargo test` panic with "frontendDist path doesn't exist" unless `pnpm vite build` has run; CI does this in `rust.yml` before cargo steps.
- `serde(default)` per-field on `SessionState` / `AppConfig` lets new fields land without a schema version bump. Match this pattern when adding fields.
- pnpm `minimumReleaseAge` constraint blocks plugin versions younger than ~3 days; pin to a slightly older stable version when adding `tauri-plugin-*` deps.
- Tauri command argument name `state` collides with the `State<AppState>` injection; the managed state arg is named `app` in command handlers.
- `release-please-config.json` bumps `package.json`, `src-tauri/tauri.conf.json` (jsonpath `$.version`), and `src-tauri/Cargo.toml` (`# x-release-please-version` annotation) on each release. Keep all three in sync.

## Types

Shared TS types in `src/types.ts`: `Track`, `LibraryStats`, `ContentType`, `SortColumn`, `SortDir`, `SortOption`, `ScanResult`. Rust mirrors these with `#[serde(rename_all = "camelCase")]` structs in `db.rs` / `lib.rs` / `scan_state.rs`.

## Workflows (`.github/workflows/`)

- `ci.yml` calls `lint.yml`, `typecheck.yml`, `unit-test.yml`, `rust.yml`, and `build.yml` (Linux x64) on PR
- `build.yml` is a reusable workflow that wraps `tauri-apps/tauri-action` and uploads bundle paths as artifacts (consumed by future e2e + by release upload)
- `release-please.yml` runs release-please then matrix-calls `build.yml` per platform (macOS arm64/x64, Linux x64, Windows x64), then uploads artifacts to the GitHub Release with `gh release upload`
