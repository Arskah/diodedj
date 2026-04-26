# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
pnpm build          # electron-vite build → out/{main,preload,renderer}
pnpm start          # electron-vite preview (build + run packaged output)
pnpm dev            # electron-vite dev (HMR for renderer, watch for main/preload)
pnpm typecheck      # tsc --noEmit on node + web tsconfigs
pnpm test           # vitest (watch mode)
pnpm test -- run    # vitest single run
pnpm lint           # eslint
pnpm format         # prettier --write .
pnpm format:check   # prettier --check .
```

Pre-commit hook runs lint-staged (prettier + eslint fix) then vitest.

## Architecture

Electron app with strict context isolation. Three process boundaries:

**Main process** (`src/main/`) — Node.js, has full system access:

- `main.ts` — app lifecycle, IPC handlers, custom `media://` protocol
- `db.ts` — SQLite with FTS5 full-text search, WAL mode
- `scanner.ts` — recursive audio file discovery + metadata extraction via `music-metadata`
- `config.ts` — persists `libraryPaths[]` to `{userData}/config.json`
- `playlist.ts` — random track selection from DB

**Preload** (`src/preload.ts`) — bridge, exposes typed `window.api` via `contextBridge`

**Renderer** (`src/renderer/`) — browser context, no Node access:

- `renderer.ts` — all UI logic, playback control, playlist state (Vite bundles as ES module)
- `env.d.ts` — TypeScript declarations for `window.api`
- `index.html` is the Vite entry; references `<script type="module" src="./renderer.ts">`

## Key Patterns

**Audio playback:** Custom `media://track/{id}` protocol registered with `stream: true`. Main process resolves track ID → file path → serves via `net.fetch(file://)`. Renderer uses standard `<audio>` element with custom protocol URLs.

**Search:** FTS5 virtual table on title/artist/album/genre. Triggers keep FTS in sync with tracks table. Query tokenized as prefix match: `foo bar` → `"foo"* "bar"*`.

**Scan + prune:** On scan, `removeTracksNotInPaths()` deletes tracks not matching any configured library path, then rescans all paths. Empty paths array deletes all tracks.

**Auto-playlist:** Toggle mode that maintains 5-track lookahead buffer. Refills from random DB selection when running low.

## Gotchas

- `audio.src = ''` does NOT clear src per HTML spec — use `removeAttribute('src')` + `load()`.
- `better-sqlite3` is a native module — `electron-rebuild` runs in postinstall. `.npmrc` has `shamefully-hoist=true` for pnpm compatibility.
- `music-metadata` is ESM-only — imported via dynamic `await import()`. electron-vite's `externalizeDepsPlugin` keeps it external (not bundled).
- electron-vite output filenames mirror the entry: main entry `src/main/main.ts` → `out/main/main.js`, preload entry `src/preload.ts` → `out/preload/preload.js`. `package.json#main` and `mainWindow.ts` preload path must match.
- In dev, `process.env.ELECTRON_RENDERER_URL` is set by electron-vite → `mainWindow.loadURL`. In prod it is undefined → `loadFile('../renderer/index.html')`.

## Types

Shared types in `src/types.ts`: `Track`, `TrackInsert`, `LibraryStats`, `ScanResult`. Renderer uses local `Track` type (can't import from types.ts without making it a module).
