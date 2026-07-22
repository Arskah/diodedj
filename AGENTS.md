# AGENTS.md

## Build & Run Commands

```bash
pnpm dev                                          # tauri dev (Vite HMR for renderer, cargo watch for backend)
pnpm build                                        # tauri build → src-tauri/target/release/bundle/<format>/
pnpm typecheck                                    # svelte-check + tsc on tsconfig.node.json
pnpm test                                         # vitest watch
pnpm test -- run                                  # vitest single run (62 renderer tests)
pnpm e2e                                          # tauri-driver + WebdriverIO (Linux only — see e2e/README.md)
cargo test --manifest-path src-tauri/Cargo.toml   # 24 backend tests (db, scanner, session, playlist, config)
pnpm lint                                         # eslint
pnpm format                                       # prettier --write .
pnpm format:check                                 # prettier --check .
```

## Architecture

Tauri 2 app. Two process boundaries: a Rust backend and a Svelte 5 / Vite renderer talking over Tauri `invoke` + `emit`/`listen`.

**Rust backend** (`src-tauri/src/`) — grouped by domain:

- `lib.rs` — `tauri::Builder` setup (`tauri-plugin-log` first, then `tauri-plugin-dialog`), `AppState`, all `#[tauri::command]` handlers, panic hook (force-capture backtrace → `log::error!`)
- `main.rs` — thin `pub fn main() { diodedj_lib::run() }` binary entry
- `audio/` — `formats.rs` (supported extension table), `player.rs` (rodio `Sink` on a worker thread driven by `mpsc::Sender<Cmd>`; symphonia decoders for mp3/flac/vorbis/wav/aac/m4a; emits `player:time` (10 Hz) / `player:duration` / `player:pause-state` / `player:ended` / `player:error`)
- `library/` — `db.rs` (rusqlite + FTS5, WAL, `parking_lot::Mutex<Connection>`, `user_version` migrations), `scanner.rs` + `scan_state.rs` (recursive walkdir scan, `lofty` tag extraction, mtime+content_type delta cache, background worker thread emitting `scan-progress` / `scan-state-changed` events with cancel token)
- `persist/` — `config.rs` (`AppConfig` → `{app_data_dir}/config.json`), `session.rs` (`SessionState` per-field defaults → `{app_data_dir}/session.json`)
- `playlist.rs` — random selection with jingle/commercial interleaving (every-4 / every-8)

**Frontend** (`src/`) — Vite root + Tauri Svelte template convention:

- `main.ts` — app entry; mounts Svelte, hooks Tauri `onCloseRequested` to await `flushSave()` before `win.destroy()`
- `App.svelte` — top-level UI tree
- `shared/` — `types.ts`, `api.ts` (typed `invoke()` wrapper, folder picker via `@tauri-apps/plugin-dialog`), `state.svelte.ts` (Svelte 5 `$state` store, talks to backend via `PlayerBackend`), colocated `state.test.ts` + `mockBackend.ts`
- `features/<feature>/` — one folder per UI feature: `library/`, `playlist/`, `player/` (NowPlaying.svelte + CueDeck.svelte + backend.ts + nativeBackend.ts), `scan/`, `settings/` (SettingsOverlay.svelte — Library + Audio tabs), `toolbar/`, `track/`

## Key Patterns

**Audio playback:** in-process Rust player. Renderer calls `player_load(trackId)`; the Rust worker thread decodes via symphonia, emits time/duration/pause-state/ended/error events. No browser `<audio>` element, no `media://` protocol, no transcoder.

**Search:** FTS5 virtual table on title/artist/album/genre. Triggers keep FTS in sync with tracks table. Query tokenized as prefix match: `foo bar` → `"foo"* "bar"*`.

**Scan + prune:** On scan, the scan worker walks the configured paths, deletes DB rows whose path no longer falls under any configured library path, then upserts present files. Empty paths array → all tracks deleted.

**Auto-playlist:** Toggle mode that maintains a 5-track lookahead buffer. Refills from random DB selection when running low.

**Seek:** `audio/player.rs` reloads the source on seek and prefers `Source::try_seek` (container-level binary search). Fallback is `skip_duration` (sample iteration). `seek_offset + sink.get_pos()` keeps `player:time` accurate.

## Gotchas

- `tauri::generate_context!()` runs at compile time and validates `frontendDist=../dist`. `cargo clippy` / `cargo test` panic with "frontendDist path doesn't exist" unless `pnpm vite build` has run; CI does this in `rust.yml` before cargo steps.
- `serde(default)` per-field on `SessionState` / `AppConfig` lets new fields land without a schema version bump. Match this pattern when adding fields.
- pnpm `minimumReleaseAge` constraint blocks plugin versions younger than ~3 days; pin to a slightly older stable version when adding `tauri-plugin-*` deps.
- Tauri command argument name `state` collides with the `State<AppState>` injection; the managed state arg is named `app` in command handlers.
- `release-please-config.json` bumps `package.json`, `src-tauri/tauri.conf.json` (jsonpath `$.version`), and `src-tauri/Cargo.toml` (`# x-release-please-version` annotation) on each release. Keep all three in sync.
- `tauri-plugin-log` is initialized first in the builder chain so panics before later plugin setup still reach the file sink. Renderer `console.*` is intercepted by `attachConsole()` in `main.ts`; vitest must not import `main.ts` (it doesn't — tests use `mockBackend`). Log level honors `RUST_LOG` (whole-app level only — no module syntax) and falls back to `Debug` in `cfg!(debug_assertions)` / `Info` in release. `symphonia*` modules are forced to `Warn` to keep the webview console readable.

## Data files

DiodeDJ stores its database (`diodedj.db`), config (`config.json`), session
state (`session.json`), and default now-playing output in a per-user data
directory.

- macOS: `~/Library/Application Support/com.diodedj/`
- Linux: `~/.local/share/com.diodedj/` (or `$XDG_DATA_HOME/com.diodedj/`)
- Windows: `%APPDATA%\com.diodedj\` (typically `C:\Users\<you>\AppData\Roaming\com.diodedj\`)

## Logs

DiodeDJ writes a rotating log file (`DiodeDJ.log`, 1 MB max, one prior file kept).

- macOS: `~/Library/Logs/com.diodedj/DiodeDJ.log`
- Linux: `~/.local/share/com.diodedj/logs/DiodeDJ.log` (or `$XDG_DATA_HOME/com.diodedj/logs/`)
- Windows: `%LOCALAPPDATA%\com.diodedj\logs\DiodeDJ.log`

Set `RUST_LOG=debug` (or `trace`) before launching to raise verbosity. Default is `info` (release) or `debug` (dev).

## Testing

Pre-commit hook runs lint-staged (prettier + eslint fix) then vitest.

CI gates Rust with `cargo fmt --check` + `cargo clippy --all-targets -- -D warnings` (`.github/workflows/rust.yml`); run both locally before pushing.
