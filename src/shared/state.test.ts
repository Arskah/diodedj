import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockBackend } from "./mockBackend";

const { api } = vi.hoisted(() => {
  const api = {
    platform: "darwin",
    search: vi.fn(),
    getTrack: vi.fn(),
    getTracksByIds: vi.fn(),
    loadSession: vi.fn(),
    saveSession: vi.fn(),
    trackPlayed: vi.fn(),
    generatePlaylist: vi.fn(),
    pickFiller: vi.fn(),
    getStats: vi.fn(),
    getPaths: vi.fn(),
    getAllPaths: vi.fn(),
    addPath: vi.fn(),
    removePath: vi.fn(),
    scanLibraries: vi.fn(),
    cancelScan: vi.fn(),
    getScanStatus: vi.fn(),
    onScanProgress: vi.fn(),
    onScanStateChanged: vi.fn(),
    listAudioDevices: vi.fn(),
    getMainDevice: vi.fn(),
    setMainDevice: vi.fn(),
    getCueDevice: vi.fn(),
    setCueDevice: vi.fn(),
  };
  return { api };
});

vi.mock("./api", () => ({ api }));

vi.mock("../features/deck/nativeBackend", () => ({
  NativeBackend: class {
    on(): () => void {
      return () => {};
    }
    load(): Promise<void> {
      return Promise.resolve();
    }
    play(): Promise<void> {
      return Promise.resolve();
    }
    pause(): Promise<void> {
      return Promise.resolve();
    }
    stop(): Promise<void> {
      return Promise.resolve();
    }
    seek(): Promise<void> {
      return Promise.resolve();
    }
    setVolume(): Promise<void> {
      return Promise.resolve();
    }
    dispose(): Promise<void> {
      return Promise.resolve();
    }
  },
}));

import { AppState, formatTime, type Track } from "./state.svelte";
import type { ScanStatus } from "./api";
import { isTrackItem, type PlaylistItem } from "./types";

const pid = (i: PlaylistItem): number | "STOP" =>
  isTrackItem(i) ? i.track.id : "STOP";

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
  api.scanLibraries.mockResolvedValue({ alreadyRunning: false });
  api.cancelScan.mockResolvedValue(undefined);
  api.getScanStatus.mockResolvedValue({ status: "idle", lastResult: null });
  api.getTracksByIds.mockResolvedValue([]);
  api.loadSession.mockResolvedValue({
    state: {
      playlistIds: [],
      playlistItems: [],
      historyIds: [],
      currentTrackId: null,
      currentTime: 0,
      autoPlaylistActive: false,
      autoAdvance: true,
      volume: 1,
      cueVolume: 1,
    },
    tracks: [],
  });
  api.saveSession.mockResolvedValue(undefined);
  api.listAudioDevices.mockResolvedValue([]);
  api.getMainDevice.mockResolvedValue(null);
  api.getCueDevice.mockResolvedValue(null);
  api.setMainDevice.mockResolvedValue(undefined);
  api.setCueDevice.mockResolvedValue(undefined);
}

interface TestApp {
  app: AppState;
  mock: MockBackend;
  cueMock: MockBackend;
}

function makeApp(): TestApp {
  document.body.innerHTML = "";
  document.title = "DiodeDJ";
  const mock = new MockBackend();
  const cueMock = new MockBackend();
  const app = new AppState(mock, cueMock);
  return { app, mock, cueMock };
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
    expect(pid(app.playlist[1])).toBe(2);
  });

  it("removeFromPlaylist splices the entry without touching currentTrack", () => {
    app.addToPlaylist(t(1));
    app.addToPlaylist(t(2));
    app.addToPlaylist(t(3));
    app.currentTrack = t(99);
    app.removeFromPlaylist(0);
    expect(app.playlist.map(pid)).toEqual([2, 3]);
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
    expect(app.playlist.map(pid)).toEqual([2, 3, 1]);
  });

  it("movePlaylistItem is a no-op when from === to", () => {
    app.addToPlaylist(t(1));
    app.addToPlaylist(t(2));
    app.movePlaylistItem(0, 0);
    expect(app.playlist.map(pid)).toEqual([1, 2]);
  });
});

describe("AppState history view", () => {
  let app: AppState;
  beforeEach(() => {
    resetApi();
    app = makeApp().app;
  });

  it("playlistTab defaults to playlist", () => {
    expect(app.playlistTab).toBe("playlist");
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
    expect(app.playlist.map(pid)).toEqual([1]);
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
    expect(mock.lastLoadedId).toBe(7);
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
    expect(app.playlist.map(pid)).toEqual([2]);
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
    expect(app.playlist.map(pid)).toEqual([2]);
  });

  it("prev within 3s when current already equals history top just rewinds", () => {
    app.addToPlaylist(t(1));
    app.addToPlaylist(t(2));
    app.playIndex(0);
    app.playIndex(0);
    app.currentTime = 1;
    app.prev();
    expect(app.currentTrack?.id).toBe(1);
    expect(app.playlist.map(pid)).toEqual([2]);
    app.currentTime = 1;
    app.prev();
    expect(app.currentTrack?.id).toBe(1);
    expect(app.history.map((x) => x.id)).toEqual([1]);
    expect(app.playlist.map(pid)).toEqual([2]);
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

  it("loadLibraryPaths stores response", async () => {
    await app.loadLibraryPaths();
    expect(app.libraryPaths.music).toEqual(["/m"]);
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

  it("scan invokes scanLibraries fire-and-forget without blocking on result", async () => {
    await app.scan();
    expect(api.scanLibraries).toHaveBeenCalled();
  });

  it("cancelScan invokes the api", async () => {
    await app.cancelScan();
    expect(api.cancelScan).toHaveBeenCalled();
  });

  it("scan-state-changed transition from running to idle refreshes search + stats", async () => {
    const cb = api.onScanStateChanged.mock.calls[0]?.[0] as
      ((s: ScanStatus) => void) | undefined;
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
      ((s: ScanStatus) => void) | undefined;
    const progCb = api.onScanProgress.mock.calls[0]?.[0] as
      ((p: { processed: number; total: number }) => void) | undefined;
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
        playlistItems: [],
        historyIds: [1],
        currentTrackId: 2,
        currentTime: 12.5,
        autoPlaylistActive: true,
        autoAdvance: false,
        volume: 0.6,
        cueVolume: 0.3,
      },
      tracks: [t(1), t(2), t(3)],
    });

    ({ app, mock } = makeApp());
    await app.loadSession();

    expect(app.playlist.map(pid)).toEqual([2, 3]);
    expect(app.history.map((x) => x.id)).toEqual([1]);
    expect(app.currentTrack?.id).toBe(2);
    expect(app.autoPlaylistActive).toBe(true);
    expect(app.autoAdvance).toBe(false);
    expect(app.volume).toBe(0.6);
    expect(app.currentTime).toBe(12.5);
    expect(mock.lastLoadedId).toBe(2);
    expect(document.title).toBe("t2 - a2 | DiodeDJ");
  });

  it("loadSession drops missing track ids", async () => {
    api.loadSession.mockResolvedValueOnce({
      state: {
        playlistIds: [1, 99, 2],
        playlistItems: [],
        historyIds: [42],
        currentTrackId: 7,
        currentTime: 0,
        autoPlaylistActive: false,
        autoAdvance: true,
        volume: 1,
        cueVolume: 1,
      },
      tracks: [t(1), t(2)],
    });

    ({ app, mock } = makeApp());
    await app.loadSession();

    expect(app.playlist.map(pid)).toEqual([1, 2]);
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

describe("AppState cue deck", () => {
  let app: AppState;
  let mock: MockBackend;
  let cueMock: MockBackend;

  beforeEach(() => {
    resetApi();
    ({ app, mock, cueMock } = makeApp());
  });

  it("cueLoadAndPlay loads + plays on cue backend, leaves main untouched", async () => {
    app.cueLoadAndPlay(t(7, { title: "Cue", artist: "Band" }));
    await flushAsync();
    expect(cueMock.lastLoadedId).toBe(7);
    expect(cueMock.playCalls).toBeGreaterThan(0);
    expect(mock.lastLoadedId).toBeUndefined();
    expect(app.cueTrack?.id).toBe(7);
    expect(app.cueDuration).toBe(100);
    expect(app.cueCurrentTime).toBe(0);
  });

  it("cueTogglePlay pauses then resumes via cue backend", async () => {
    app.cueLoadAndPlay(t(1));
    await flushAsync();
    expect(cueMock.playCalls).toBe(1); // initial load+play
    cueMock.emitPauseState(false);
    expect(app.cueIsPlaying).toBe(true);
    app.cueTogglePlay();
    expect(cueMock.pauseCalls).toBeGreaterThan(0);
    cueMock.emitPauseState(true);
    expect(app.cueIsPlaying).toBe(false);
    app.cueTogglePlay();
    expect(cueMock.playCalls).toBe(2);
  });

  it("cueTogglePlay is a no-op when no cue track loaded", () => {
    app.cueTogglePlay();
    expect(cueMock.playCalls).toBe(0);
    expect(cueMock.pauseCalls).toBe(0);
  });

  it("cueStop clears cue state and stops backend", () => {
    app.cueLoadAndPlay(t(1));
    app.cueDuration = 200;
    app.cueCurrentTime = 30;
    app.cueIsPlaying = true;
    app.cueStop();
    expect(cueMock.stopCalls).toBeGreaterThan(0);
    expect(app.cueTrack).toBeNull();
    expect(app.cueIsPlaying).toBe(false);
    expect(app.cueCurrentTime).toBe(0);
    expect(app.cueDuration).toBe(0);
  });

  it("cueSeekToPct clamps + applies via cue backend", () => {
    app.cueLoadAndPlay(t(1));
    app.cueDuration = 100;
    app.cueSeekToPct(0.25);
    expect(app.cueCurrentTime).toBe(25);
    expect(cueMock.lastSeek).toBe(25);
    app.cueSeekToPct(2);
    expect(app.cueCurrentTime).toBe(100);
    expect(cueMock.lastSeek).toBe(100);
    app.cueSeekToPct(-1);
    expect(app.cueCurrentTime).toBe(0);
    expect(cueMock.lastSeek).toBe(0);
  });

  it("cueSeekToPct is a no-op when cueDuration is zero", () => {
    app.cueDuration = 0;
    app.cueCurrentTime = 5;
    app.cueSeekToPct(0.5);
    expect(app.cueCurrentTime).toBe(5);
    expect(cueMock.seekCalls.length).toBe(0);
  });

  it("setCueVolume updates state and cue backend", () => {
    app.setCueVolume(0.4);
    expect(app.cueVolume).toBe(0.4);
    expect(cueMock.volume).toBe(0.4);
  });

  it("promoteCueToMain inserts cue track at playlist head; cue keeps playing", () => {
    app.addToPlaylist(t(1));
    app.addToPlaylist(t(2));
    app.cueLoadAndPlay(t(99, { title: "promoted" }));
    app.promoteCueToMain();
    expect(app.playlist.map(pid)).toEqual([99, 1, 2]);
    expect(app.cueTrack?.id).toBe(99);
    expect(cueMock.stopCalls).toBe(0);
  });

  it("promoteCueToMain is a no-op when no cue track loaded", () => {
    app.addToPlaylist(t(1));
    app.promoteCueToMain();
    expect(app.playlist.map(pid)).toEqual([1]);
  });

  it("cue backend time/duration/pause-state events mirror to cue state", () => {
    cueMock.emitTime(7);
    expect(app.cueCurrentTime).toBe(7);
    cueMock.emitDuration(180);
    expect(app.cueDuration).toBe(180);
    cueMock.emitPauseState(false);
    expect(app.cueIsPlaying).toBe(true);
    cueMock.emitPauseState(true);
    expect(app.cueIsPlaying).toBe(false);
  });

  it("cue backend ended event resets cue playing/time without touching main", () => {
    app.cueLoadAndPlay(t(1));
    app.cueIsPlaying = true;
    app.cueCurrentTime = 50;
    app.currentTrack = t(2);
    cueMock.emitEnded();
    expect(app.cueIsPlaying).toBe(false);
    expect(app.cueCurrentTime).toBe(0);
    expect(app.currentTrack?.id).toBe(2);
  });

  it("cueProgressPct reflects cueCurrentTime/cueDuration", () => {
    app.cueDuration = 200;
    app.cueCurrentTime = 50;
    expect(app.cueProgressPct).toBe(25);
    app.cueDuration = 0;
    expect(app.cueProgressPct).toBe(0);
  });
});

describe("AppState audio device config", () => {
  let app: AppState;

  beforeEach(() => {
    resetApi();
    api.listAudioDevices.mockResolvedValue([
      { name: "default-out", description: "Built-in", isDefault: true },
      { name: "hw:USB,0", description: "USB Headphones", isDefault: false },
    ]);
    api.getMainDevice.mockResolvedValue(null);
    api.getCueDevice.mockResolvedValue({
      name: "hw:USB,0",
      description: "USB Headphones",
    });
    app = makeApp().app;
  });

  it("loadAudioConfig populates devices, mainDevice, cueDevice", async () => {
    await app.loadAudioConfig();
    expect(app.audioDevices.length).toBe(2);
    expect(app.mainDevice).toBeNull();
    expect(app.cueDevice?.name).toBe("hw:USB,0");
  });

  it("setMainDeviceConfig persists + updates state", async () => {
    await app.setMainDeviceConfig({ name: "x", description: "X" });
    expect(api.setMainDevice).toHaveBeenCalledWith({
      name: "x",
      description: "X",
    });
    expect(app.mainDevice?.name).toBe("x");
  });

  it("setCueDeviceConfig with null disables cue + clears cue state", async () => {
    await app.loadAudioConfig();
    app.cueLoadAndPlay(t(1));
    app.cueDuration = 100;

    await app.setCueDeviceConfig(null);

    expect(api.setCueDevice).toHaveBeenCalledWith(null);
    expect(app.cueDevice).toBeNull();
    expect(app.cueTrack).toBeNull();
    expect(app.cueDuration).toBe(0);
  });

  it("setCueDeviceConfig with a device persists and stores", async () => {
    const ref = { name: "hw:USB,0", description: "USB Headphones" };
    await app.setCueDeviceConfig(ref);
    expect(api.setCueDevice).toHaveBeenCalledWith(ref);
    expect(app.cueDevice).toEqual(ref);
  });
});

describe("AppState session persistence with cue volume", () => {
  let app: AppState;

  beforeEach(() => {
    resetApi();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loadSession restores cueVolume", async () => {
    api.loadSession.mockResolvedValueOnce({
      state: {
        playlistIds: [],
        playlistItems: [],
        historyIds: [],
        currentTrackId: null,
        currentTime: 0,
        autoPlaylistActive: false,
        autoAdvance: true,
        volume: 1,
        cueVolume: 0.25,
      },
      tracks: [],
    });
    ({ app } = makeApp());
    await app.loadSession();
    expect(app.cueVolume).toBe(0.25);
  });

  it("persistSession writes cueVolume", async () => {
    ({ app } = makeApp());
    await app.loadSession();
    app.setCueVolume(0.7);
    vi.runAllTimers();
    expect(api.saveSession).toHaveBeenCalled();
    const arg = api.saveSession.mock.calls[0][0];
    expect(arg.cueVolume).toBe(0.7);
  });
});

describe("AppState stop marker", () => {
  let app: AppState;
  let mock: MockBackend;
  beforeEach(() => {
    resetApi();
    ({ app, mock } = makeApp());
  });

  it("addStopMarker appends a stop sentinel", () => {
    app.addStopMarker();
    expect(app.playlist.length).toBe(1);
    expect(pid(app.playlist[0])).toBe("STOP");
  });

  it("playIndex on a stop marker stops playback and consumes the marker", () => {
    app.addToPlaylist(t(1));
    app.playIndex(0);
    expect(app.currentTrack?.id).toBe(1);
    app.addStopMarker();
    app.autoPlaylistActive = true;
    app.playIndex(0);
    expect(app.currentTrack).toBeNull();
    expect(app.playlist.length).toBe(0);
    expect(app.autoPlaylistActive).toBe(false);
    expect(mock.stopCalls).toBeGreaterThan(0);
    expect(app.history.map((x) => x.id)).toEqual([1]);
  });

  it("ended event onto a stop marker halts auto-advance", async () => {
    app.addToPlaylist(t(1));
    app.addStopMarker();
    app.addToPlaylist(t(2));
    app.autoPlaylistActive = true;
    app.playIndex(0);
    expect(app.currentTrack?.id).toBe(1);
    mock.emitEnded();
    await flushAsync();
    expect(app.currentTrack).toBeNull();
    expect(app.playlist.map(pid)).toEqual([2]);
    expect(app.autoPlaylistActive).toBe(false);
  });

  it("togglePlay from idle with stop marker at front consumes it without playing", () => {
    app.addStopMarker();
    app.addToPlaylist(t(7));
    app.togglePlay();
    expect(app.currentTrack).toBeNull();
    expect(app.playlist.map(pid)).toEqual([7]);
    app.togglePlay();
    expect(app.currentTrack?.id).toBe(7);
  });

  it("next() advancing onto a stop marker halts", () => {
    app.addStopMarker();
    app.addToPlaylist(t(5));
    app.currentTrack = t(99);
    app.next();
    expect(app.currentTrack).toBeNull();
    expect(app.playlist.map(pid)).toEqual([5]);
  });

  it("maybeRefillPlaylist skips when any stop marker present", async () => {
    api.generatePlaylist.mockResolvedValue([t(99)]);
    app.autoPlaylistActive = true;
    app.addStopMarker();
    await app.maybeRefillPlaylist();
    expect(api.generatePlaylist).not.toHaveBeenCalled();
    expect(app.playlist.map(pid)).toEqual(["STOP"]);
  });

  it("history never contains stop markers", () => {
    app.addToPlaylist(t(1));
    app.addStopMarker();
    app.playIndex(0);
    app.playIndex(0);
    expect(app.history.map((x) => x.id)).toEqual([1]);
  });
});

describe("AppState session persistence (stop markers)", () => {
  let app: AppState;

  beforeEach(() => {
    resetApi();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("persistSession writes playlistItems with mixed track and stop entries", async () => {
    ({ app } = makeApp());
    await app.loadSession();
    app.addToPlaylist(t(1));
    app.addStopMarker();
    app.addToPlaylist(t(2));
    vi.runAllTimers();
    const arg = api.saveSession.mock.calls[0][0];
    expect(arg.playlistItems).toEqual([
      { kind: "track", id: 1 },
      { kind: "stop" },
      { kind: "track", id: 2 },
    ]);
    expect(arg.playlistIds).toEqual([1, 2]);
  });

  it("loadSession rebuilds playlist from playlistItems including stops", async () => {
    api.loadSession.mockResolvedValueOnce({
      state: {
        playlistIds: [],
        playlistItems: [
          { kind: "track", id: 1 },
          { kind: "stop" },
          { kind: "track", id: 2 },
        ],
        historyIds: [],
        currentTrackId: null,
        currentTime: 0,
        autoPlaylistActive: false,
        autoAdvance: true,
        volume: 1,
        cueVolume: 1,
      },
      tracks: [t(1), t(2)],
    });
    ({ app } = makeApp());
    await app.loadSession();
    expect(app.playlist.map(pid)).toEqual([1, "STOP", 2]);
  });

  it("loadSession falls back to legacy playlistIds when playlistItems empty", async () => {
    api.loadSession.mockResolvedValueOnce({
      state: {
        playlistIds: [3, 4],
        playlistItems: [],
        historyIds: [],
        currentTrackId: null,
        currentTime: 0,
        autoPlaylistActive: false,
        autoAdvance: true,
        volume: 1,
        cueVolume: 1,
      },
      tracks: [t(3), t(4)],
    });
    ({ app } = makeApp());
    await app.loadSession();
    expect(app.playlist.map(pid)).toEqual([3, 4]);
  });
});
