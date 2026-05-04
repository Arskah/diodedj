import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockBackend } from "./mockBackend";

vi.mock("electron-log/renderer", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    verbose: vi.fn(),
    debug: vi.fn(),
    silly: vi.fn(),
  },
}));

const { api } = vi.hoisted(() => {
  const api = {
    search: vi.fn(),
    getTrack: vi.fn(),
    getTracksByIds: vi.fn(),
    loadSession: vi.fn(),
    saveSession: vi.fn(),
    trackPlayed: vi.fn(),
    generatePlaylist: vi.fn(),
    getStats: vi.fn(),
    getPaths: vi.fn(),
    getAllPaths: vi.fn(),
    addPath: vi.fn(),
    removePath: vi.fn(),
    scanLibrary: vi.fn(),
    cancelScan: vi.fn(),
    getScanStatus: vi.fn(),
    onScanProgress: vi.fn(),
    onScanStateChanged: vi.fn(),
    player: {
      load: vi.fn().mockResolvedValue(undefined),
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      seek: vi.fn().mockResolvedValue(undefined),
      setVolume: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn(),
    },
  };
  (window as unknown as { api: typeof api }).api = api;
  return { api };
});

import {
  AppState,
  formatTime,
  type Track,
} from "../../src/renderer/state.svelte";

const t = (id: number, extra: Partial<Track> = {}): Track => ({
  id,
  title: `t${id}`,
  artist: `a${id}`,
  album: `al${id}`,
  duration: 100,
  play_count: 0,
  ...extra,
});

function resetApi(): void {
  vi.clearAllMocks();
  api.search.mockResolvedValue([]);
  api.trackPlayed.mockResolvedValue(undefined);
  api.generatePlaylist.mockResolvedValue([]);
  api.getStats.mockResolvedValue({
    totalTracks: 0,
    totalArtists: 0,
    totalAlbums: 0,
    totalHours: 0,
  });
  api.getAllPaths.mockResolvedValue({
    music: [],
    commercial: [],
    jingle: [],
  });
  api.addPath.mockResolvedValue(null);
  api.removePath.mockResolvedValue(true);
  api.scanLibrary.mockResolvedValue({ alreadyRunning: false });
  api.cancelScan.mockResolvedValue(undefined);
  api.getScanStatus.mockResolvedValue({ status: "idle", lastResult: null });
  api.getTracksByIds.mockResolvedValue([]);
  api.loadSession.mockResolvedValue({
    state: {
      playlistIds: [],
      historyIds: [],
      currentTrackId: null,
      currentTime: 0,
      autoPlaylistActive: false,
      autoAdvance: true,
      volume: 1,
    },
    tracks: [],
  });
  api.saveSession.mockResolvedValue(undefined);
}

interface TestApp {
  app: AppState;
  mock: MockBackend;
}

function makeApp(): TestApp {
  document.body.innerHTML = "";
  document.title = "DiodeDJ";
  const mock = new MockBackend();
  const app = new AppState(mock);
  return { app, mock };
}

async function flushAsync(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("formatTime", () => {
  it("formats seconds as M:SS", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(5)).toBe("0:05");
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(3661)).toBe("61:01");
  });

  it("returns 0:00 for invalid input", () => {
    expect(formatTime(NaN)).toBe("0:00");
    expect(formatTime(Infinity)).toBe("0:00");
  });
});

describe("AppState playlist mutations", () => {
  let app: AppState;
  beforeEach(() => {
    resetApi();
    app = makeApp().app;
  });

  it("addToPlaylist appends tracks", () => {
    app.addToPlaylist(t(1));
    app.addToPlaylist(t(2));
    expect(app.playlist.length).toBe(2);
    expect(app.playlist[1].id).toBe(2);
  });

  it("removeFromPlaylist splices the entry without touching currentTrack", () => {
    app.addToPlaylist(t(1));
    app.addToPlaylist(t(2));
    app.addToPlaylist(t(3));
    app.currentTrack = t(99);
    app.removeFromPlaylist(0);
    expect(app.playlist.map((x) => x.id)).toEqual([2, 3]);
    expect(app.currentTrack?.id).toBe(99);
  });

  it("clearPlaylist empties the queue but leaves currentTrack playing", () => {
    app.addToPlaylist(t(1));
    app.currentTrack = t(99);
    app.clearPlaylist();
    expect(app.playlist.length).toBe(0);
    expect(app.currentTrack?.id).toBe(99);
  });

  it("movePlaylistItem reorders entries", () => {
    app.addToPlaylist(t(1));
    app.addToPlaylist(t(2));
    app.addToPlaylist(t(3));
    app.movePlaylistItem(0, 2);
    expect(app.playlist.map((x) => x.id)).toEqual([2, 3, 1]);
  });

  it("movePlaylistItem is a no-op when from === to", () => {
    app.addToPlaylist(t(1));
    app.addToPlaylist(t(2));
    app.movePlaylistItem(0, 0);
    expect(app.playlist.map((x) => x.id)).toEqual([1, 2]);
  });
});

describe("AppState history view", () => {
  let app: AppState;
  beforeEach(() => {
    resetApi();
    app = makeApp().app;
  });

  it("playlistTab defaults to queue", () => {
    expect(app.playlistTab).toBe("queue");
  });

  it("historyDisplay reverses storage order (newest first)", () => {
    app.history.push(t(1), t(2), t(3));
    expect(app.historyDisplay.map((x) => x.id)).toEqual([3, 2, 1]);
  });

  it("history caps at 100 entries, dropping the oldest", () => {
    for (let i = 0; i < 100; i++) app.history.push(t(i));
    app.currentTrack = t(500);
    app.playNow(t(999));
    expect(app.history.length).toBe(100);
    expect(app.history[0].id).toBe(1);
    expect(app.history[99].id).toBe(500);
  });

  it("removeFromHistory uses display index (newest first)", () => {
    app.history.push(t(1), t(2), t(3));
    app.removeFromHistory(0);
    expect(app.history.map((x) => x.id)).toEqual([1, 2]);
    app.removeFromHistory(1);
    expect(app.history.map((x) => x.id)).toEqual([2]);
  });

  it("removeFromHistory ignores out-of-range indices", () => {
    app.history.push(t(1));
    app.removeFromHistory(5);
    app.removeFromHistory(-1);
    expect(app.history.length).toBe(1);
  });

  it("clearHistory empties history without touching playback", () => {
    app.history.push(t(1), t(2));
    app.currentTrack = t(99);
    app.clearHistory();
    expect(app.history.length).toBe(0);
    expect(app.currentTrack?.id).toBe(99);
  });

  it("requeueFromHistory appends the chosen entry to the playlist tail", () => {
    app.history.push(t(1), t(2), t(3));
    app.requeueFromHistory(2);
    expect(app.playlist.map((x) => x.id)).toEqual([1]);
    expect(app.history.map((x) => x.id)).toEqual([1, 2, 3]);
  });

  it("requeueFromHistory is a no-op for invalid indices", () => {
    app.history.push(t(1));
    app.requeueFromHistory(5);
    expect(app.playlist.length).toBe(0);
  });
});

describe("AppState playback control", () => {
  let app: AppState;
  let mock: MockBackend;
  beforeEach(() => {
    resetApi();
    ({ app, mock } = makeApp());
  });

  it("playIndex pulls track out of playlist into currentTrack and plays it", () => {
    app.addToPlaylist(t(7, { title: "Song", artist: "Band" }));
    app.playIndex(0);
    expect(app.currentTrack?.id).toBe(7);
    expect(app.playlist.length).toBe(0);
    expect(mock.lastLoadedTrackId).toBe(7);
    expect(api.trackPlayed).toHaveBeenCalledWith(7);
    expect(document.title).toBe("Song - Band | DiodeDJ");
  });

  it("playing a new track moves the previous one into history", () => {
    app.addToPlaylist(t(1));
    app.addToPlaylist(t(2));
    app.addToPlaylist(t(3));
    app.playIndex(0);
    expect(app.history.length).toBe(0);
    app.playIndex(0);
    expect(app.history.map((x) => x.id)).toEqual([1]);
    app.playNow(t(99));
    expect(app.history.map((x) => x.id)).toEqual([1, 2]);
    expect(app.currentTrack?.id).toBe(99);
  });

  it("playIndex out of range is a no-op", () => {
    app.playIndex(0);
    expect(app.currentTrack).toBeNull();
    expect(api.trackPlayed).not.toHaveBeenCalled();
  });

  it("playNow plays directly without enqueuing", () => {
    app.playNow(t(5));
    expect(app.currentTrack?.id).toBe(5);
    expect(app.playlist.length).toBe(0);
  });

  it("next plays the next queued track", () => {
    app.addToPlaylist(t(1));
    app.addToPlaylist(t(2));
    app.next();
    expect(app.currentTrack?.id).toBe(1);
    expect(app.playlist.map((x) => x.id)).toEqual([2]);
  });

  it("next is a no-op when playlist empty", () => {
    app.currentTrack = t(99);
    app.next();
    expect(app.currentTrack?.id).toBe(99);
  });

  it("prev after 3s seeks to start of current track", () => {
    app.currentTrack = t(1);
    app.currentTime = 5;
    app.prev();
    expect(app.currentTime).toBe(0);
    expect(mock.lastSeek).toBe(0);
    expect(app.currentTrack?.id).toBe(1);
  });

  it("prev within 3s peeks history (entry stays) and pushes current onto queue head", () => {
    app.addToPlaylist(t(1));
    app.addToPlaylist(t(2));
    app.playIndex(0);
    app.playIndex(0);
    expect(app.currentTrack?.id).toBe(2);
    expect(app.history.map((x) => x.id)).toEqual([1]);
    app.currentTime = 1;
    app.prev();
    expect(app.currentTrack?.id).toBe(1);
    expect(app.history.map((x) => x.id)).toEqual([1]);
    expect(app.playlist.map((x) => x.id)).toEqual([2]);
  });

  it("prev within 3s when current already equals history top just rewinds", () => {
    app.addToPlaylist(t(1));
    app.addToPlaylist(t(2));
    app.playIndex(0);
    app.playIndex(0);
    app.currentTime = 1;
    app.prev();
    expect(app.currentTrack?.id).toBe(1);
    expect(app.playlist.map((x) => x.id)).toEqual([2]);
    app.currentTime = 1;
    app.prev();
    expect(app.currentTrack?.id).toBe(1);
    expect(app.history.map((x) => x.id)).toEqual([1]);
    expect(app.playlist.map((x) => x.id)).toEqual([2]);
    expect(app.currentTime).toBe(0);
  });

  it("prev within 3s with empty history just restarts current", () => {
    app.currentTrack = t(1);
    app.currentTime = 1;
    app.prev();
    expect(app.currentTime).toBe(0);
    expect(mock.lastSeek).toBe(0);
    expect(app.currentTrack?.id).toBe(1);
  });

  it("prev is a no-op when no current track and empty history", () => {
    app.currentTime = 5;
    app.prev();
    expect(app.currentTime).toBe(5);
    expect(mock.seekCalls.length).toBe(0);
    expect(app.currentTrack).toBeNull();
  });

  it("togglePlay starts head of queue when nothing playing and playlist non-empty", () => {
    app.addToPlaylist(t(3));
    app.togglePlay();
    expect(app.currentTrack?.id).toBe(3);
    expect(api.trackPlayed).toHaveBeenCalledWith(3);
  });

  it("toggleMode flips autoAdvance", () => {
    expect(app.autoAdvance).toBe(true);
    app.toggleMode();
    expect(app.autoAdvance).toBe(false);
    app.toggleMode();
    expect(app.autoAdvance).toBe(true);
  });

  it("toggleAutoPlaylist activates and starts playing first track when idle", async () => {
    app.addToPlaylist(t(9));
    await app.toggleAutoPlaylist();
    expect(app.autoPlaylistActive).toBe(true);
    expect(app.currentTrack?.id).toBe(9);
  });

  it("toggleAutoPlaylist deactivates without touching playback", async () => {
    app.autoPlaylistActive = true;
    await app.toggleAutoPlaylist();
    expect(app.autoPlaylistActive).toBe(false);
  });

  it("stop clears currentTrack, autoPlaylist flag, time/duration and title, and pushes to history", () => {
    app.addToPlaylist(t(5));
    app.addToPlaylist(t(6));
    app.playIndex(0);
    app.playIndex(0);
    expect(app.history.length).toBe(1);
    app.autoPlaylistActive = true;
    app.currentTime = 12;
    app.duration = 200;
    app.stop();
    expect(app.currentTrack).toBeNull();
    expect(app.history.map((x) => x.id)).toEqual([5, 6]);
    expect(app.autoPlaylistActive).toBe(false);
    expect(app.currentTime).toBe(0);
    expect(app.duration).toBe(0);
    expect(document.title).toBe("DiodeDJ");
    expect(mock.stopCalls).toBeGreaterThan(0);
  });

  it("setVolume updates state and backend", () => {
    app.setVolume(0.4);
    expect(app.volume).toBe(0.4);
    expect(mock.volume).toBe(0.4);
  });

  it("seekToPct clamps and applies via backend", () => {
    app.duration = 100;
    app.currentTime = 0;
    app.seekToPct(0.5);
    expect(app.currentTime).toBe(50);
    expect(mock.lastSeek).toBe(50);
    app.seekToPct(2);
    expect(app.currentTime).toBe(100);
    expect(mock.lastSeek).toBe(100);
    app.seekToPct(-1);
    expect(app.currentTime).toBe(0);
    expect(mock.lastSeek).toBe(0);
  });

  it("seekToPct is a no-op when duration is zero", () => {
    app.duration = 0;
    app.currentTime = 7;
    app.seekToPct(0.5);
    expect(app.currentTime).toBe(7);
    expect(mock.seekCalls.length).toBe(0);
  });

  it("progressPct reflects currentTime/duration ratio", () => {
    app.duration = 200;
    app.currentTime = 50;
    expect(app.progressPct).toBe(25);
    app.duration = 0;
    expect(app.progressPct).toBe(0);
  });
});

describe("AppState backend events", () => {
  let app: AppState;
  let mock: MockBackend;
  beforeEach(() => {
    resetApi();
    ({ app, mock } = makeApp());
  });

  it("time event mirrors to currentTime", () => {
    mock.emitTime(42);
    expect(app.currentTime).toBe(42);
  });

  it("duration event mirrors to duration", () => {
    mock.emitDuration(180);
    expect(app.duration).toBe(180);
  });

  it("pause-state event mirrors to isPlaying (inverse)", () => {
    mock.emitPauseState(false);
    expect(app.isPlaying).toBe(true);
    mock.emitPauseState(true);
    expect(app.isPlaying).toBe(false);
  });

  it("ended event triggers auto-advance when enabled", async () => {
    app.addToPlaylist(t(1));
    app.addToPlaylist(t(2));
    app.playIndex(0);
    expect(app.currentTrack?.id).toBe(1);
    mock.emitEnded();
    await flushAsync();
    expect(app.currentTrack?.id).toBe(2);
  });

  it("ended event stops playback when autoAdvance is false", async () => {
    app.addToPlaylist(t(1));
    app.addToPlaylist(t(2));
    app.playIndex(0);
    app.autoAdvance = false;
    mock.emitEnded();
    await flushAsync();
    expect(app.currentTrack).toBeNull();
  });
});

describe("AppState library + paths", () => {
  let app: AppState;
  beforeEach(() => {
    resetApi();
    api.search.mockResolvedValue([t(1), t(2)]);
    api.getStats.mockResolvedValue({
      totalTracks: 5,
      totalArtists: 2,
      totalAlbums: 3,
      totalHours: 1,
    });
    api.getAllPaths.mockResolvedValue({
      music: ["/m"],
      commercial: [],
      jingle: [],
    });
    app = makeApp().app;
  });

  it("search forwards query + tab and stores results", async () => {
    app.searchQuery = "foo";
    app.activeTab = "music";
    await app.search();
    expect(api.search).toHaveBeenCalledWith("foo", "music", undefined, "asc");
    expect(app.tracks.length).toBe(2);
  });

  it("setTab updates activeTab and triggers a search for it", () => {
    app.setTab("jingle");
    expect(app.activeTab).toBe("jingle");
    expect(api.search).toHaveBeenCalledWith("", "jingle", undefined, "asc");
  });

  it("toggleSort sets column ascending then flips direction on second click", async () => {
    await app.toggleSort("title");
    expect(app.sortBy).toBe("title");
    expect(app.sortDir).toBe("asc");
    expect(api.search).toHaveBeenLastCalledWith("", "music", "title", "asc");
    await app.toggleSort("title");
    expect(app.sortDir).toBe("desc");
    expect(api.search).toHaveBeenLastCalledWith("", "music", "title", "desc");
  });

  it("toggleSort to a different column resets direction to asc", async () => {
    app.sortBy = "artist";
    app.sortDir = "desc";
    await app.toggleSort("album");
    expect(app.sortBy).toBe("album");
    expect(app.sortDir).toBe("asc");
    expect(api.search).toHaveBeenLastCalledWith("", "music", "album", "asc");
  });

  it("loadStats stores response", async () => {
    await app.loadStats();
    expect(app.stats?.totalTracks).toBe(5);
  });

  it("loadPaths stores response", async () => {
    await app.loadPaths();
    expect(app.paths.music).toEqual(["/m"]);
  });

  it("addPath skips reload when api returns null", async () => {
    api.addPath.mockResolvedValueOnce(null);
    await app.addPath("music");
    expect(api.getAllPaths).not.toHaveBeenCalled();
  });

  it("addPath reloads when api returns a new path", async () => {
    api.addPath.mockResolvedValueOnce("/new");
    await app.addPath("music");
    expect(api.getAllPaths).toHaveBeenCalled();
  });

  it("removePath calls api then reloads", async () => {
    await app.removePath("music", "/m");
    expect(api.removePath).toHaveBeenCalledWith("music", "/m");
    expect(api.getAllPaths).toHaveBeenCalled();
  });

  it("scan invokes scanLibrary fire-and-forget without blocking on result", async () => {
    await app.scan();
    expect(api.scanLibrary).toHaveBeenCalled();
  });

  it("cancelScan invokes the api", async () => {
    await app.cancelScan();
    expect(api.cancelScan).toHaveBeenCalled();
  });

  it("scan-state-changed transition from running to idle refreshes search + stats", async () => {
    const cb = api.onScanStateChanged.mock.calls[0]?.[0] as
      | ((s: ScanStatus) => void)
      | undefined;
    expect(cb).toBeDefined();
    cb!({ status: "running", processed: 0, total: 0 });
    expect(app.scanStatus.status).toBe("running");
    api.search.mockClear();
    api.getStats.mockClear();
    cb!({ status: "idle", lastResult: { total: 5, added: 5 } });
    await Promise.resolve();
    expect(api.search).toHaveBeenCalled();
    expect(api.getStats).toHaveBeenCalled();
  });

  it("scan-progress patches running state", () => {
    const stateCb = api.onScanStateChanged.mock.calls[0]?.[0] as
      | ((s: ScanStatus) => void)
      | undefined;
    const progCb = api.onScanProgress.mock.calls[0]?.[0] as
      | ((p: { processed: number; total: number }) => void)
      | undefined;
    stateCb!({ status: "running", processed: 0, total: 0 });
    progCb!({ processed: 7, total: 10 });
    expect(app.scanStatus).toEqual({
      status: "running",
      processed: 7,
      total: 10,
    });
  });
});

describe("AppState auto-playlist refill", () => {
  let app: AppState;
  const bufferSize = 20;
  const generateTracks = (start: number, count: number): Track[] =>
    Array.from({ length: count }, (_, i) => t(start + i));

  beforeEach(() => {
    resetApi();
    api.generatePlaylist.mockResolvedValue(generateTracks(0, bufferSize));
    app = makeApp().app;
  });

  it("does nothing when auto-playlist is inactive", async () => {
    await app.maybeRefillPlaylist();
    expect(api.generatePlaylist).not.toHaveBeenCalled();
  });

  it("fills empty playlist up to the buffer", async () => {
    app.autoPlaylistActive = true;
    await app.maybeRefillPlaylist();
    expect(api.generatePlaylist).toHaveBeenCalledWith(bufferSize);
    expect(app.playlist.length).toBe(bufferSize);
  });

  it("requests only the deficit when partially full", async () => {
    app.autoPlaylistActive = true;
    app.addToPlaylist(t(1));
    app.addToPlaylist(t(2));
    app.addToPlaylist(t(3));
    app.addToPlaylist(t(4));

    api.generatePlaylist.mockResolvedValueOnce(
      generateTracks(10, bufferSize - 4),
    );
    await app.maybeRefillPlaylist();
    expect(api.generatePlaylist).toHaveBeenCalledWith(bufferSize - 4);
    expect(app.playlist.length).toBe(bufferSize);
  });

  it("does nothing when remaining threshold is already met", async () => {
    const threshold = 5;
    app.autoPlaylistActive = true;
    const initialTracks = generateTracks(0, threshold);
    initialTracks.forEach((track) => app.addToPlaylist(track));
    await app.maybeRefillPlaylist();
    expect(api.generatePlaylist).not.toHaveBeenCalled();
  });
});

describe("AppState session persistence", () => {
  let app: AppState;
  let mock: MockBackend;

  beforeEach(() => {
    resetApi();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loadSession hydrates playlist, history, current track and flags", async () => {
    api.loadSession.mockResolvedValueOnce({
      state: {
        playlistIds: [2, 3],
        historyIds: [1],
        currentTrackId: 2,
        currentTime: 12.5,
        autoPlaylistActive: true,
        autoAdvance: false,
        volume: 0.6,
      },
      tracks: [t(1), t(2), t(3)],
    });

    ({ app, mock } = makeApp());
    await app.loadSession();

    expect(app.playlist.map((x) => x.id)).toEqual([2, 3]);
    expect(app.history.map((x) => x.id)).toEqual([1]);
    expect(app.currentTrack?.id).toBe(2);
    expect(app.autoPlaylistActive).toBe(true);
    expect(app.autoAdvance).toBe(false);
    expect(app.volume).toBe(0.6);
    expect(app.currentTime).toBe(12.5);
    expect(mock.lastLoadedTrackId).toBe(2);
    expect(document.title).toBe("t2 - a2 | DiodeDJ");
  });

  it("loadSession drops missing track ids", async () => {
    api.loadSession.mockResolvedValueOnce({
      state: {
        playlistIds: [1, 99, 2],
        historyIds: [42],
        currentTrackId: 7,
        currentTime: 0,
        autoPlaylistActive: false,
        autoAdvance: true,
        volume: 1,
      },
      tracks: [t(1), t(2)],
    });

    ({ app, mock } = makeApp());
    await app.loadSession();

    expect(app.playlist.map((x) => x.id)).toEqual([1, 2]);
    expect(app.history).toEqual([]);
    expect(app.currentTrack).toBeNull();
  });

  it("does not save before session is loaded", () => {
    ({ app, mock } = makeApp());
    app.addToPlaylist(t(1));
    vi.runAllTimers();
    expect(api.saveSession).not.toHaveBeenCalled();
  });

  it("debounced save fires after mutations once session is loaded", async () => {
    ({ app, mock } = makeApp());
    await app.loadSession();
    app.addToPlaylist(t(1));
    app.addToPlaylist(t(2));
    expect(api.saveSession).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(api.saveSession).toHaveBeenCalledTimes(1);
    const arg = api.saveSession.mock.calls[0][0];
    expect(arg.playlistIds).toEqual([1, 2]);
    expect(arg.currentTrackId).toBeNull();
    expect(arg.autoAdvance).toBe(true);
    expect(arg.volume).toBe(1);
  });

  it("flushSave persists immediately and cancels pending timer", async () => {
    ({ app, mock } = makeApp());
    await app.loadSession();
    app.addToPlaylist(t(5));
    app.flushSave();
    expect(api.saveSession).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(api.saveSession).toHaveBeenCalledTimes(1);
  });
});
