# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
pnpm build          # tsc → dist/, copies HTML/CSS to dist/renderer/
pnpm start          # electron . (requires build first)
pnpm dev            # concurrent tsc watch + asset watch + electronmon (hot reload)
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

- `renderer.ts` — all UI logic, playback control, playlist state
- `env.d.ts` — TypeScript declarations for `window.api`
- No module imports allowed in renderer.ts (runs as `<script>`, not a module)

## Key Patterns

**Audio playback:** Custom `media://track/{id}` protocol registered with `stream: true`. Main process resolves track ID → file path → serves via `net.fetch(file://)`. Renderer uses standard `<audio>` element with custom protocol URLs.

**Search:** FTS5 virtual table on title/artist/album/genre. Triggers keep FTS in sync with tracks table. Query tokenized as prefix match: `foo bar` → `"foo"* "bar"*`.

**Scan + prune:** On scan, `removeTracksNotInPaths()` deletes tracks not matching any configured library path, then rescans all paths. Empty paths array deletes all tracks.

**Auto-playlist:** Toggle mode that maintains 5-track lookahead buffer. Refills from random DB selection when running low.

## Gotchas

- `renderer.ts` must have zero imports/exports — tsc emits CJS wrapper that breaks in browser. HTML has `<script>var exports = {};</script>` shim as workaround.
- `audio.src = ''` does NOT clear src per HTML spec — use `removeAttribute('src')` + `load()`.
- `better-sqlite3` is a native module — `electron-rebuild` runs in postinstall. `.npmrc` has `shamefully-hoist=true` for pnpm compatibility.
- `music-metadata` is ESM-only — imported via dynamic `await import()` from CJS context.
- Static assets (HTML/CSS) not handled by tsc — copied manually in build script and watched by `scripts/watch-assets.mjs` in dev.

## Types

Shared types in `src/types.ts`: `Track`, `TrackInsert`, `LibraryStats`, `ScanResult`. Renderer uses local `Track` type (can't import from types.ts without making it a module).
