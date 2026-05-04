# Audio Backend Bypass + Cue Deck — Design

Closes [#43](https://github.com/Arskah/diodedj/issues/43) and adds secondary audio interface for monitoring (cue/preview deck).

Original design locked via grill-me on 2026-05-04 (mpv subprocess on Electron). Decisions referenced as Q# below.

**Status update (2026-05-05):** the platform pivoted from Electron → Tauri 2 in PR #76. The chromium `<audio>` pipeline was replaced not by an mpv subprocess but by an in-process rodio + symphonia player living in `src-tauri/src/player.rs`. PR-1 and PR-2 are shipped; PR-3 (cue deck) is reframed for the rodio path and tracked as [#81](https://github.com/Arskah/diodedj/issues/81). ReplayGain + LAME-tag gapless trim moved to a separate audio-polish track [#80](https://github.com/Arskah/diodedj/issues/80).

## Goals

- ~~Replace renderer `<audio>` element with a controllable backend that bypasses the Chromium audio pipeline.~~ **Done in PR #76.**
- Add an independent cue deck that plays a different track on a second audio device for headphone preview. **Pending — #81.**
- Keep the backend choice swappable behind an interface. **Done — `PlayerBackend` in `src/renderer/player/backend.ts`.**

## Backend

- `PlayerBackend` interface in `src/renderer/player/backend.ts`. Methods: `load(trackId)`, `play()`, `pause()`, `stop()`, `seek(seconds)`, `setVolume(0..1)`, `on(event, cb)`, `dispose()`. Event contract: `time`, `duration`, `pause-state`, `ended`, `error`. (Q6)
- `setDevice(id)` is **deferred** to PR-3 — current rodio backend uses the system default output.
- One backend instance per deck. `mainDeck = new NativeBackend()` shipped; `cueDeck = new NativeBackend({device})` planned. Interface is deck-agnostic. (Q7)
- v1 impl = **rodio + symphonia** running on a dedicated worker thread inside the Tauri Rust process. Replaces the original mpv-subprocess plan (Q12). Reasoning: stays in-process (no IPC socket, no respawn dance), symphonia covers mp3/flac/vorbis/wav/aac/m4a out of the box, no third-party binary to bundle/sign.
- Backend internalizes decode. No app-level transcode helper. ffmpeg dropped entirely. (Q9)

### Rust player anatomy

`src-tauri/src/player.rs`:

- `PlayerHandle` owns an `mpsc::Sender<Cmd>`. `Cmd` enum: `Load { path, duration }`, `Play`, `Pause`, `Stop`, `Seek(f64)`, `SetVolume(f32)`.
- Worker thread holds a rodio `Sink` connected to `OutputStreamBuilder::open_default_stream()`.
- 50ms tick: drain command queue, emit `player:time` at 10 Hz, detect EOF via `sink.empty()`.
- Seek: re-decode source, prefer `Source::try_seek` (container-level binary search), fall back to `skip_duration` (sample iteration) when the format doesn't support seek tables.
- `seek_offset` field tracks the post-seek base so `player:time = seek_offset + sink.get_pos()` stays accurate.

### Symphonia features enabled

```toml
rodio = { version = "0.21", features = ["symphonia-mp3", "symphonia-flac",
                                         "symphonia-vorbis", "symphonia-wav",
                                         "symphonia-aac", "symphonia-isomp4"] }
```

No `--audio-exclusive` analogue today; exclusive output mode is a cpal-level concern tracked under #81.

`DIODEDJ_LOG=debug` (via `tauri-plugin-log`, #79) will gate verbose backend logging once that plugin lands. For now `RUST_LOG=debug` works at dev time.

### Lifecycle (rodio path)

- Worker thread is spawned eagerly during Tauri `setup()` and lives for the process lifetime. (Replaces Q14c eager-spawn-mpv.)
- No subprocess crash/respawn logic — a panic on the worker thread is logged via `log::error!` and emits `player:error`; the whole Tauri process is the failure boundary. (Supersedes Q14d/Q25c.)
- On Tauri `WindowEvent::CloseRequested`, `src/renderer/main.ts` preventDefaults, awaits `app.flushSave()`, then calls `win.destroy()`. State persists before exit. No SIGKILL fallback needed. (Replaces Q14e.)
- Backend logs go through the `log` crate to stderr. Will move to `tauri-plugin-log` rotating files when #79 ships. (Replaces Q23b electron-log.)

### Distribution

mpv-bundling discussion (Q21, original §Distribution) is **fully obsolete** — no external binary to ship. Tauri bundles the Rust player statically. Linux `.deb` no longer declares mpv as a dep. The `scripts/fetch-mpv.mjs` prebuild was never written.

ALSA dev headers needed at build time on Linux (`libasound2-dev`); already wired into `.github/workflows/build.yml` and `rust.yml`.

## Decks

### Model

- Two decks: main + cue. Fully independent transport (own current track, position, volume, play state). Shared library source. (Q2)
- Cue UI is intentionally minimal mini-deck: title + play/pause + click-to-seek progress bar + volume slider + promote-to-main button. No skip buttons. (Q3 gamma minus skip per Q4)
- Cue EOF → idle. No auto-advance, no loop. (Q15a)
- `trackPlayed` (play_count, history append) fires only on main-deck completion. Cue does not write history.

### Promote-to-main

- Cue button "→ main" inserts the cue track as `playlist[0]` (next-up). Current main keeps playing. Cue keeps playing through the promoted track until EOF or replaced. (Q5, P2)

### Gapless

- **PR-3 implementation note:** rodio's `Sink::append` accepts queueing — the next source can be appended while the current is still playing. Plan is to maintain a 1-track lookahead by listening to renderer playlist mutations and calling a new `Cmd::SetNext { path }` that pre-decodes and appends the source so EOF flows seamlessly into the next sample stream. (Replaces Q15b/G1 mpv-`loadfile`-append.)
- LAME-tag encoder delay/padding trim is on the audio-polish issue (#80) and is what unlocks _true_ click-free transitions. Plain rodio queueing without trim still has small gaps for MP3.
- Cue is single-track; no gapless concern.

## Devices

### Storage

`config.json` will gain (PR-3):

```rust
struct AppConfig {
    music_paths: Vec<PathBuf>,
    main_device_id: Option<DeviceRef>,  // None = system default
    cue_device_id:  Option<DeviceRef>,  // None = cue disabled
}

struct DeviceRef { name: String, description: String }
```

Stored as `{name, description}` for graceful fallback. On boot, exact-match `name` against current device list → use; else fuzzy-match `description` → use, log warning, update stored `name`; else fallback (Q8d).

(Q8a, Q24a — adapted from Electron `config.json` layout to the Rust `AppConfig` struct in `src-tauri/src/config.rs`.)

### Enumeration

- New Tauri command `audio_list_devices() -> Vec<DeviceInfo>` exposed from Rust.
- Implementation: enumerate via `cpal::HostTrait::output_devices()` (cpal is already in the dep tree under rodio). `id` = device name (cpal exposes name, not opaque handle). `description` = human-readable label.
- Replaces the planned mpv `audio-device-list` IPC (Q8b).

### First run

Cue disabled. Operator opts in via Settings → Audio → pick cue device. (Q8c)

### Failure handling

- Boot, saved id missing: cue → disable + persistent banner in cue panel ("No cue device. [Pick device]"); main → fallback to system default, log warning, transient toast. (Q8d)
- Hot-swap during playback: cue → pause + transient toast ("Cue device disconnected"), require manual re-pick; main → auto-fallback to default. (Q8e)
- Errors logged through the `log` crate (→ `tauri-plugin-log` once #79 lands) regardless of UI surfacing.

## UI

### Layout (W2)

`NowPlaying.svelte` row refactored into flexbox row with two children:

```
+-------------------+-------------------+
| Main deck         | Cue deck          |
+-------------------+-------------------+
```

Cue child hidden when `cueDeviceId === null`. Main expands full width when cue hidden. (Q18)

### Settings overlay (S2)

- Rename `PathsOverlay.svelte` → `SettingsOverlay.svelte`. Sections: Library (existing paths UI), Audio (device pickers + exclusive toggle), Scan (rescan button moves here from toolbar).
- Toolbar: replace `Paths` and `Scan` buttons with a single gear icon button that opens `SettingsOverlay`. `Auto Playlist` button stays in toolbar.

### Library row (C2 + C3)

Add headphones icon button next to existing ▶ and + buttons. Click loads track to cue and plays. Hotkey `C` while row hovered/focused does the same. (Q19)

### Status bar / errors (E5)

- Reuse `ScanStatusBar` pattern; rename to `StatusBar`. Add transient error message slot (auto-dismiss 5s). (Q22)
- Cue panel renders inline persistent banner when cue device unavailable.

## Hotkeys (K3)

- `Space` = toggle main play/pause
- `Shift+Space` = toggle cue play/pause
- `←` / `→` = main seek ±5s
- `Shift+←` / `Shift+→` = cue seek ±5s
- `Enter` = promote cue to main next-up
- `Esc` = stop cue
- `C` (with library row focus/hover) = load row to cue

No existing keyboard bindings to migrate. (Q13)

## IPC

### Naming

- Commands renderer→backend: Tauri `invoke` calls. Already shipped: `player_load`, `player_play`, `player_pause`, `player_stop`, `player_seek`, `player_set_volume`. PR-3 adds `cue_load`, `cue_play`, `cue_pause`, `cue_seek`, `cue_set_volume`, `cue_set_device`, `audio_list_devices`. (Adapted from Q23a `player:<deck>:<verb>` Electron pattern; Tauri commands are flat and snake_case.)
- Events backend→renderer: Tauri `app.emit("event", payload)` listened via `@tauri-apps/api/event#listen`. Already shipped: `player:time`, `player:duration`, `player:pause-state`, `player:ended`, `player:error`. PR-3 mirrors with `cue:*` event prefix.
- `DeckId = "main" | "cue"` shared TS type.

### Throttling

- `player:time` events: throttled in Rust worker to 10 Hz (`TIME_EMIT_INTERVAL = 100ms`). Two decks → ~20 events/s. (Q16a, T2)
- Volume slider: renderer-side leading + trailing throttle 50ms. ~20 invokes/s during drag. (Q16b, V3)
- Renderer holds local optimistic state — `app.volume`, `currentTime` during seek update immediately on user input; invoke fires after, no waiting on backend ack. (Q16c)

### Types

PR-3 adds `DeckId`, command/event payload types to `src/types.ts`. Keep single shared file until it grows past ~300 LOC. (Q23a, Y1)

## Persistence

`SessionState` adds one field: `cueVolume: number` (default 1). Cue track / position not persisted — cue is ephemeral preview. (Q10, R2)

`src-tauri/src/session.rs` uses `serde(default)` per-field, so adding `cue_volume: f32` (default 1.0) is forward/backward compatible. No schema version bump.

`mainDeviceId` and `cueDeviceId` live in `config.json` (`AppConfig`), not session.

## Drops (PR-2 — done in PR #76)

Files / entries removed when chromium audio bypass landed:

- `src/main/transcode.ts` ✅ — entire `src/main/` tree removed in Tauri port
- `src/main/audio-formats.ts` ✅
- `media://` protocol registration + `mediaHandler` in `src/main/main.ts` ✅
- `getMediaUrl` from preload + renderer ✅
- `ffmpeg-static` dep ✅
- `electron-builder.json#asarUnpack` ✅ — file deleted with electron-builder itself
- `ffmpeg-static` from `package.json#pnpm.onlyBuiltDependencies` ✅

Net delta: ~80MB saved across platform installs **plus** Electron itself (~150MB → ~10MB Tauri runtime per platform).

## Testing

- Backend impl: 24 cargo unit tests cover db/scanner/session/playlist/config. The rodio worker thread is **not** unit-tested today (would need a fake audio sink). A `cargo test` smoke that loads a silent fixture and verifies `player:ended` is a future task. (Adapts Q17a/U3 — original mpv smoke plan dropped.)
- `state.svelte.ts` deck logic: `MockBackend` in `tests/renderer/mockBackend.ts` exposes `loadedIds`, `play/pause/stop/seek/setVolume` plus test helpers `emitEnded()`, `emitTime(t)`. 62 vitest tests cover playlist, history, cue interactions (skeleton) and auto-advance. (Q17b, updated for `loadedIds: number[]` after the load-takes-track-id refactor.)
- e2e: tauri-driver + WebdriverIO harness (Linux-only, mac WKWebView has no WebDriver) — tracked under [#77](https://github.com/Arskah/diodedj/issues/77). Stub backend mode (`DIODEDJ_E2E_FAKE_PLAYER=1`) carries forward but needs reimplementation for the rodio backend. (Q17c, P2)

## Ship plan (SP3)

- **PR-1 — backend abstraction.** ✅ Shipped pre-Tauri: `PlayerBackend` interface + `HtmlAudioBackend`, `state.svelte.ts` refactored to talk to a backend instance. Pure refactor.
- **PR-2 — chromium bypass (closes #43).** ✅ Shipped as **PR #76 (Tauri port)**. Implementation diverged from the original plan: instead of `MpvBackend` on Electron, the renderer calls `NativeBackend` over Tauri invokes that drive `src-tauri/src/player.rs` (rodio + symphonia). `HtmlAudioBackend`, `transcode.ts`, `media://`, `audio-formats.ts`, and `ffmpeg-static` were all dropped in the same PR.
- **PR-3 — cue deck.** ⏳ Tracked as [#81](https://github.com/Arskah/diodedj/issues/81). Reframed against rodio + cpal: second `PlayerHandle` instance, cpal-based device enumeration via `audio_list_devices` Tauri command, settings overlay refactor (`PathsOverlay` → `SettingsOverlay`), cue panel (W2), promote-to-main, hotkeys (K3), library headphones button, error UX (E5), cue device config. Companion audio-polish work (ReplayGain + LAME-tag gapless trim) on [#80](https://github.com/Arskah/diodedj/issues/80).
