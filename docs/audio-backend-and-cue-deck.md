# Audio Backend Bypass + Cue Deck — Design

Closes [#43](https://github.com/Arskah/diodedj/issues/43) and adds secondary audio interface for monitoring (cue/preview deck).

Design locked via grill-me on 2026-05-04. Decisions referenced as Q# below.

## Goals

- Replace renderer `<audio>` element with a controllable backend that bypasses the Chromium audio pipeline.
- Add an independent cue deck that plays a different track on a second audio device for headphone preview.
- Keep the backend choice swappable behind an interface.

## Backend

- `PlayerBackend` interface in `src/main/player/backend.ts`. Methods: `load(path)`, `play()`, `pause()`, `stop()`, `seek(seconds)`, `setVolume(0..1)`, `setDevice(id)`, `dispose()`. Event emitter contract: `time`, `duration`, `pause-state`, `ended`, `error`. (Q6)
- One backend instance per deck. App spawns `mainDeck = new MpvBackend({device})` and `cueDeck = new MpvBackend({device})`. Interface is deck-agnostic. (Q7)
- v1 impl = bundled mpv subprocess. Reasoning: ffmpeg-grade codec coverage, gapless trivial, exclusive output, replay-gain. (Q12)
- Backend internalizes decode. No app-level transcode helper. Future native backend (e.g. naudiodon) would pipe ffmpeg internally. (Q9)

### mpv flags

Fixed per process:

```
--idle=yes
--no-video
--no-terminal
--no-input-default-bindings
--no-osc
--gapless-audio=yes
--prefetch-playlist=yes
--keep-open=no
--msg-level=all=warn
--input-ipc-server=<sock>
--audio-device=<id>
--volume=100
--replaygain=track
```

Toggleable via Audio settings:

- `--audio-exclusive=yes|no` (default `no`). (Q20a)

`--replaygain` default `track`; album mode not exposed in v1. (Q20b)

`DIODEDJ_MPV_VERBOSE=1` env flips `--msg-level=all=v` for debugging.

### Lifecycle

- Eager spawn main on `app.whenReady`. Lazy spawn cue on first cue device pick or first cue action. (Q14c, L3)
- Auto-respawn on crash: max 3 attempts within 60s, backoff 250ms / 1s / 4s. After cap: stop respawning, surface persistent banner ("audio backend crashed, restart app"), log fatal. (Q14d, Q25c)
- On respawn, restore last-loaded track + position so live playback continues.
- `before-quit`: send `quit` IPC, wait ≤500ms, then SIGKILL. (Q14e)
- mpv stdout/stderr piped to electron-log at `verbose` level prefixed `[mpv:main]` / `[mpv:cue]`. (Q23b)

### Distribution

Per-platform strategy. (Q21)

- macOS arm64 + x64: bundle mpv via `extraResources`. Source: official mpv.app universal builds; extract binary. Code-sign + notarize as nested binary (electron-builder `afterSign` with `hardenedRuntime: true`).
- Windows x64: bundle mpv via `extraResources`. Source: shinchiro static builds.
- Linux x64: do not bundle. `deb` declares `Depends: mpv (>= 0.34)`. AppImage falls back to system PATH; surface clear error if missing.

`scripts/fetch-mpv.mjs` runs in CI prebuild, no-ops on Linux. mpv version pinned exactly (e.g. `0.39.0`); bump intentionally via PR. (Q25b)

Spawn-time path resolution:

- prod: `process.resourcesPath/mpv[.exe]` on mac/win; `mpv` on PATH on linux.
- dev: `vendor/mpv/<platform>/mpv[.exe]` on mac/win; `mpv` on PATH on linux. `vendor/mpv/` is gitignored.

## Decks

### Model

- Two decks: main + cue. Fully independent transport (own current track, position, volume, play state). Shared library source. (Q2)
- Cue UI is intentionally minimal mini-deck: title + play/pause + click-to-seek progress bar + volume slider + promote-to-main button. No skip buttons. (Q3 gamma minus skip per Q4)
- Cue EOF → idle. No auto-advance, no loop. (Q15a)
- `trackPlayed` (play_count, history append) fires only on main-deck completion. Cue does not write history.

### Promote-to-main

- Cue button "→ main" inserts the cue track as `playlist[0]` (next-up). Current main keeps playing. Cue keeps playing through the promoted track until EOF or replaced. (Q5, P2)

### Gapless

- Main deck: backend keeps mpv's internal playlist 1-track lookahead synced with renderer's `playlist[0]`. On any playlist mutation (add / remove / promote / clearPlaylist), main calls `mainDeck.setNext(path | null)` which issues `playlist-clear` + `loadfile <next> append` to mpv. mpv prefetches and crossfades-free (gapless) on EOF. (Q15b, G1)
- Cue is single-track; no gapless concern.

## Devices

### Storage

`config.json` adds:

```ts
{
  mainDeviceId: { name: string; description: string } | null;
  cueDeviceId: { name: string; description: string } | null;
}
```

(Q8a, Q24a)

Stored as `{name, description}` for graceful fallback. On boot, exact-match `name` against current device list → use; else fuzzy-match `description` → use, log warning, update stored `name`; else fallback (Q8d).

`null` for `mainDeviceId` = system default. `null` for `cueDeviceId` = cue disabled.

### Enumeration

- Cross-backend static method `Backend.listDevices()` returning `{ id: string; description: string }[]`. Backend-internal id format opaque to renderer. (Q8b)
- mpv impl: query via IPC `get_property audio-device-list`.

### First run

Cue disabled. Operator opts in via Settings → Audio → pick cue device. (Q8c)

### Failure handling

- Boot, saved id missing: cue → disable + persistent banner in cue panel ("No cue device. [Pick device]"); main → fallback to system default, log warning, transient toast. (Q8d)
- Hot-swap during playback: cue → pause + transient toast ("Cue device disconnected"), require manual re-pick; main → auto-fallback to default. (Q8e)
- Errors logged to electron-log regardless of UI surfacing.

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

- Commands renderer→main: `player:<deck>:<verb>` e.g. `player:main:load`, `player:cue:seek`, `player:cue:set-device`. (Q23a)
- Events main→renderer: `player:<deck>:<event>` e.g. `player:main:time`, `player:cue:ended`.
- Settings: `audio:list-devices`, `audio:get-config`, `audio:set-config`.
- `DeckId = "main" | "cue"` shared type.

### Throttling

- mpv `time-pos` events: throttled in main to 10Hz (drop if <100ms since last forward). Two decks → ~20 IPC/s. (Q16a, T2)
- Volume slider: renderer-side leading + trailing throttle 50ms. ~20 IPC/s during drag. (Q16b, V3)
- Renderer holds local optimistic state — `app.volume`, `currentTime` during seek update immediately on user input; IPC fires after, no waiting on backend ack. (Q16c)

### Types

Append `DeckId`, IPC payload types, and `PlayerEvent` union to `src/types.ts`. Keep single shared file until it grows past ~300 LOC. (Q23a, Y1)

## Persistence

`SessionState` adds one field: `cueVolume: number` (default 1). Cue track / position not persisted — cue is ephemeral preview. (Q10, R2)

Existing `session.ts` spread-default pattern handles migration; no version bump needed.

`mainDeviceId` and `cueDeviceId` live in `config.json`, not session.

## Drops (PR-2)

Files / entries removed when chromium audio bypass lands:

- `src/main/transcode.ts`
- `src/main/audio-formats.ts` (MIME table — entire file if no other use)
- `media://` protocol registration + `mediaHandler` in `src/main/main.ts`
- `getMediaUrl` from preload + renderer
- `ffmpeg-static` dep in `package.json`
- `node_modules/ffmpeg-static/**` from `electron-builder.json#asarUnpack`
- `ffmpeg-static` from `package.json#pnpm.onlyBuiltDependencies`

Saves ~80MB across platform installs.

## Testing

- Backend impls: mock-driven unit tests for `MpvBackend` state machine using fake IPC socket. Plus one `mpv-smoke.test.ts` per platform that spawns real mpv with `--ao=null`, plays a silent fixture, verifies `ended` event. Skipped if `mpv` not on PATH; CI sets it up. (Q17a, U3)
- `state.svelte.ts` deck logic: `MockBackend` fixture exposes `load/play/pause/...` plus test helpers `emitEnded()`, `emitTime(t)`. Tests cover: cue.load() doesn't touch history; promote inserts at `playlist[0]`; main EOF appends to history; auto-advance hits `playlist[0]`. (Q17b)
- Playwright e2e: stub backend selected when `DIODEDJ_E2E_FAKE_PLAYER=1`. Stub fires fake `ended` after 100ms. Avoids mpv + audio device requirement on headless CI. (Q17c, P2)

## Ship plan (SP3)

Three PRs, sequential. (Q24b)

1. **PR-1 — backend abstraction.** Define `PlayerBackend` interface. Implement `HtmlAudioBackend` wrapping current `<audio>` behavior. Refactor `state.svelte.ts` to talk to backend instance. Pure refactor, behavior identical. Backend contract tests. No mpv yet.
2. **PR-2 — chromium bypass (closes #43).** Implement `MpvBackend`. Add bundling + signing + fetch script. Drop `transcode.ts` / `media://` / `audio-formats.ts` / `ffmpeg-static`. Switch default backend from HtmlAudio to Mpv. Single deck only.
3. **PR-3 — cue deck.** Second backend instance. Settings overlay refactor (PathsOverlay → SettingsOverlay). Cue panel (W2). Promote-to-main. Hotkeys (K3). Library headphones button. Error UX (E5). Cue device config.
