import type {
  ContentType,
  LibraryStats,
  SortColumn,
  SortDir,
  Track,
} from "./types";
import { api, type ScanStatus, type SessionLoadResult } from "./api";
import type { PlayerBackend } from "../features/player/backend";
import { NativeBackend } from "../features/player/nativeBackend";

const logger = {
  error: (...args: unknown[]) => console.error(...args),
};

export type { Track };

// Auto playlist configuration
const AUTO_PLAYLIST_BUFFER = 20;
// Threshold at which the auto playlist will be refilled. Should be lower than AUTO_PLAYLIST_BUFFER to avoid excessive refilling.
const AUTO_PLAYLIST_THRESHOLD = 5;
const HISTORY_CAP = 100;
const SESSION_SAVE_DEBOUNCE_MS = 750;

export type PlaylistTab = "queue" | "history";

export class AppState {
  searchQuery = $state("");
  activeTab = $state<ContentType>("music");
  playlistTab = $state<PlaylistTab>("queue");
  sortBy = $state<SortColumn | null>(null);
  sortDir = $state<SortDir>("asc");
  tracks = $state<Track[]>([]);
  stats = $state<LibraryStats | null>(null);
  paths = $state<Record<ContentType, string[]>>({
    music: [],
    commercial: [],
    jingle: [],
  });
  pathsOpen = $state(false);
  scanStatus = $state<ScanStatus>({ status: "idle", lastResult: null });

  playlist = $state<Track[]>([]);
  history = $state<Track[]>([]);
  currentTrack = $state<Track | null>(null);
  autoPlaylistActive = $state(false);
  autoAdvance = $state(true);
  isPlaying = $state(false);
  volume = $state(1);
  currentTime = $state(0);
  duration = $state(0);

  hoveredTrack = $state<Track | null>(null);
  hoverX = $state(0);
  hoverY = $state(0);

  backend: PlayerBackend;

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionLoaded = false;

  constructor(backend?: PlayerBackend) {
    this.backend = backend ?? new NativeBackend();

    this.backend.on((event) => {
      switch (event.type) {
        case "pause-state":
          this.isPlaying = !event.paused;
          break;
        case "time":
          this.currentTime = event.seconds;
          this.scheduleSave();
          break;
        case "duration":
          this.duration = event.seconds;
          break;
        case "ended":
          void this.handleEnded();
          break;
        case "error":
          logger.error("Audio error:", event.message);
          break;
      }
    });

    api.onScanProgress(({ processed, total }) => {
      if (this.scanStatus.status === "running") {
        this.scanStatus = { status: "running", processed, total };
      }
    });

    api.onScanStateChanged((next) => {
      const wasRunning = this.scanStatus.status === "running";
      this.scanStatus = next;
      if (wasRunning && next.status !== "running") {
        void this.search();
        void this.loadStats();
      }
    });
  }

  get progressPct(): number {
    return this.duration ? (this.currentTime / this.duration) * 100 : 0;
  }

  setVolume(v: number): void {
    this.volume = v;
    void this.backend.setVolume(v);
    this.scheduleSave();
  }

  async search(): Promise<void> {
    this.tracks = await api.search(
      this.searchQuery,
      this.activeTab,
      this.sortBy ?? undefined,
      this.sortDir,
    );
  }

  setTab(tab: ContentType): void {
    this.activeTab = tab;
    void this.search();
  }

  toggleSort(column: SortColumn): void {
    if (this.sortBy === column) {
      this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
    } else {
      this.sortBy = column;
      this.sortDir = "asc";
    }
    void this.search();
  }

  addToPlaylist(track: Track): void {
    this.playlist.push(track);
    this.scheduleSave();
  }

  async addFiller(contentType: ContentType): Promise<void> {
    const track = await api.pickFiller(contentType);
    if (!track) return;
    this.playlist.push(track);
    this.scheduleSave();
  }

  playNow(track: Track): void {
    this.playTrack(track);
  }

  removeFromPlaylist(index: number): void {
    this.playlist.splice(index, 1);
    this.scheduleSave();
  }

  movePlaylistItem(from: number, to: number): void {
    if (from === to) return;
    const [item] = this.playlist.splice(from, 1);
    this.playlist.splice(to, 0, item);
    this.scheduleSave();
  }

  clearPlaylist(): void {
    this.playlist.length = 0;
    this.scheduleSave();
  }

  playIndex(index: number): void {
    if (index < 0 || index >= this.playlist.length) return;
    const [track] = this.playlist.splice(index, 1);
    this.playTrack(track);
  }

  private playTrack(track: Track): void {
    if (this.currentTrack) {
      this.appendHistory(this.currentTrack);
    }
    this.setCurrent(track);
  }

  get historyDisplay(): Track[] {
    return this.history.slice().reverse();
  }

  appendHistory(track: Track): void {
    this.history.push(track);
    if (this.history.length > HISTORY_CAP) {
      this.history.splice(0, this.history.length - HISTORY_CAP);
    }
    this.scheduleSave();
  }

  removeFromHistory(displayIndex: number): void {
    const i = this.history.length - 1 - displayIndex;
    if (i < 0 || i >= this.history.length) return;
    this.history.splice(i, 1);
    this.scheduleSave();
  }

  clearHistory(): void {
    this.history.length = 0;
    this.scheduleSave();
  }

  requeueFromHistory(displayIndex: number): void {
    const i = this.history.length - 1 - displayIndex;
    const track = this.history[i];
    if (!track) return;
    this.playlist.push(track);
    this.scheduleSave();
  }

  private setCurrent(track: Track): void {
    this.currentTrack = track;
    this.duration = track.duration ?? 0;
    this.currentTime = 0;
    void this.loadAndPlay(track);
    void api.trackPlayed(track.id);
    document.title = `${track.title} - ${track.artist} | DiodeDJ`;
    void this.maybeRefillPlaylist();
    this.scheduleSave();
  }

  private async loadAndPlay(track: Track): Promise<void> {
    try {
      await this.backend.load(track.id);
      await this.backend.play();
    } catch (err) {
      logger.error("Load/play failed:", err);
    }
  }

  togglePlay(): void {
    if (!this.currentTrack) {
      if (this.playlist.length > 0) this.playIndex(0);
      return;
    }
    if (this.isPlaying) {
      void this.backend.pause();
    } else {
      void this.backend
        .play()
        .catch((err) => logger.error("Resume failed:", err));
    }
  }

  stop(): void {
    if (this.currentTrack) this.appendHistory(this.currentTrack);
    void this.backend.stop();
    this.currentTrack = null;
    this.autoPlaylistActive = false;
    this.currentTime = 0;
    this.duration = 0;
    this.isPlaying = false;
    document.title = "DiodeDJ";
    this.scheduleSave();
  }

  next(): void {
    if (this.playlist.length > 0) this.playIndex(0);
  }

  prev(): void {
    if (this.currentTrack && this.currentTime > 3) {
      this.currentTime = 0;
      void this.backend.seek(0);
      return;
    }
    const previous = this.history[this.history.length - 1];
    if (!previous) {
      if (this.currentTrack) {
        this.currentTime = 0;
        void this.backend.seek(0);
      }
      return;
    }
    if (this.currentTrack?.id === previous.id) {
      this.currentTime = 0;
      void this.backend.seek(0);
      return;
    }
    if (this.currentTrack) this.playlist.unshift(this.currentTrack);
    this.setCurrent(previous);
  }

  toggleMode(): void {
    this.autoAdvance = !this.autoAdvance;
    this.scheduleSave();
  }

  async toggleAutoPlaylist(): Promise<void> {
    this.autoPlaylistActive = !this.autoPlaylistActive;
    if (this.autoPlaylistActive) {
      await this.maybeRefillPlaylist();
      if (!this.currentTrack && this.playlist.length > 0) {
        this.playIndex(0);
      }
    }
    this.scheduleSave();
  }

  async maybeRefillPlaylist(): Promise<void> {
    if (!this.autoPlaylistActive) return;
    if (this.playlist.length < AUTO_PLAYLIST_THRESHOLD) {
      const count = AUTO_PLAYLIST_BUFFER - this.playlist.length;
      const tracks = await api.generatePlaylist(count);
      this.playlist.push(...tracks);
      this.scheduleSave();
    }
  }

  setHover(track: Track, rect: DOMRect): void {
    this.hoveredTrack = track;
    this.hoverX = rect.right;
    this.hoverY = rect.top;
  }

  clearHover(): void {
    this.hoveredTrack = null;
  }

  seekToPct(pct: number): void {
    if (!this.duration) return;
    const clamped = Math.min(1, Math.max(0, pct));
    const seconds = clamped * this.duration;
    this.currentTime = seconds;
    void this.backend.seek(seconds).catch((err) => {
      logger.error("Seek failed:", err);
    });
  }

  async loadStats(): Promise<void> {
    this.stats = await api.getStats();
  }

  async loadSession(): Promise<void> {
    let result: SessionLoadResult;
    try {
      result = await api.loadSession();
    } catch (err) {
      logger.error("Session load failed:", err);
      this.sessionLoaded = true;
      return;
    }
    const { state, tracks } = result;
    const byId = new Map(tracks.map((t) => [t.id, t]));
    const resolve = (ids: number[]): Track[] =>
      ids.map((id) => byId.get(id)).filter((t): t is Track => t !== undefined);

    this.playlist = resolve(state.playlistIds);
    this.history = resolve(state.historyIds);
    this.autoPlaylistActive = state.autoPlaylistActive;
    this.autoAdvance = state.autoAdvance;
    this.setVolume(state.volume);

    const restored =
      state.currentTrackId !== null ? byId.get(state.currentTrackId) : null;
    if (restored) {
      this.currentTrack = restored;
      this.duration = restored.duration ?? 0;
      if (state.currentTime > 0) {
        this.currentTime = state.currentTime;
      }
      void this.loadWithSeek(restored, state.currentTime);
      document.title = `${restored.title} - ${restored.artist} | DiodeDJ`;
    }

    this.sessionLoaded = true;
  }

  private async loadWithSeek(track: Track, seek: number): Promise<void> {
    try {
      await this.backend.load(track.id);
      if (seek > 0) {
        await this.backend.seek(seek);
      }
    } catch (err) {
      logger.error("Resume load failed:", err);
    }
  }

  private scheduleSave(): void {
    if (!this.sessionLoaded) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.persistSession();
    }, SESSION_SAVE_DEBOUNCE_MS);
  }

  async flushSave(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.persistSession();
  }

  private async persistSession(): Promise<void> {
    try {
      await api.saveSession({
        playlistIds: this.playlist.map((t) => t.id),
        historyIds: this.history.map((t) => t.id),
        currentTrackId: this.currentTrack?.id ?? null,
        currentTime: this.currentTime,
        autoPlaylistActive: this.autoPlaylistActive,
        autoAdvance: this.autoAdvance,
        volume: this.volume,
      });
    } catch (err) {
      logger.error("Session save failed:", err);
    }
  }

  async loadPaths(): Promise<void> {
    this.paths = await api.getAllPaths();
  }

  async addPath(type: ContentType): Promise<void> {
    const added = await api.addPath(type);
    if (added) await this.loadPaths();
  }

  async removePath(type: ContentType, p: string): Promise<void> {
    await api.removePath(type, p);
    await this.loadPaths();
  }

  async scan(): Promise<void> {
    await api.scanLibrary();
  }

  async cancelScan(): Promise<void> {
    await api.cancelScan();
  }

  async hydrateScanStatus(): Promise<void> {
    this.scanStatus = await api.getScanStatus();
  }

  private async handleEnded(): Promise<void> {
    if (!this.autoAdvance) {
      this.stop();
      return;
    }

    await this.maybeRefillPlaylist();
    if (this.playlist.length > 0) this.playIndex(0);
  }
}

export const app = new AppState();

export function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
