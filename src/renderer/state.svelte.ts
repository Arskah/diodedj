import type { ContentType, LibraryStats, Track } from "../types";
import logger from "electron-log/renderer";

export type { Track };

const AUTO_PLAYLIST_BUFFER = 5;

export class AppState {
  searchQuery = $state("");
  activeTab = $state<ContentType>("music");
  tracks = $state<Track[]>([]);
  stats = $state<LibraryStats | null>(null);
  paths = $state<Record<ContentType, string[]>>({
    music: [],
    commercial: [],
    jingle: [],
  });
  pathsOpen = $state(false);
  scanOpen = $state(false);
  scanProcessed = $state(0);
  scanTotal = $state(0);

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

  audio: HTMLAudioElement;

  constructor() {
    this.audio = new Audio();
    this.audio.id = "audio";
    document.body.appendChild(this.audio);
    this.audio.addEventListener("play", () => {
      this.isPlaying = true;
    });
    this.audio.addEventListener("pause", () => {
      this.isPlaying = false;
    });
    this.audio.addEventListener("timeupdate", () => {
      this.currentTime = this.audio.currentTime;
      this.duration =
        isFinite(this.audio.duration) && this.audio.duration > 0
          ? this.audio.duration
          : (this.currentTrack?.duration ?? 0);
    });
    this.audio.addEventListener("ended", () => {
      void this.handleEnded();
    });
    this.audio.addEventListener("error", () => {
      const err = this.audio.error;
      logger.error("Audio error:", {
        code: err?.code,
        message: err?.message,
        src: this.audio.currentSrc,
      });
    });

    window.api.onScanProgress(({ processed, total }) => {
      this.scanProcessed = processed;
      this.scanTotal = total;
    });
  }

  get progressPct(): number {
    return this.duration ? (this.currentTime / this.duration) * 100 : 0;
  }

  setVolume(v: number): void {
    this.volume = v;
    this.audio.volume = v;
  }

  async search(): Promise<void> {
    this.tracks = await window.api.search(this.searchQuery, this.activeTab);
  }

  setTab(tab: ContentType): void {
    this.activeTab = tab;
    void this.search();
  }

  addToPlaylist(track: Track): void {
    this.playlist.push(track);
  }

  playNow(track: Track): void {
    this.playTrack(track);
  }

  removeFromPlaylist(index: number): void {
    this.playlist.splice(index, 1);
  }

  movePlaylistItem(from: number, to: number): void {
    if (from === to) return;
    const [item] = this.playlist.splice(from, 1);
    this.playlist.splice(to, 0, item);
  }

  clearPlaylist(): void {
    this.playlist.length = 0;
  }

  playIndex(index: number): void {
    if (index < 0 || index >= this.playlist.length) return;
    const [track] = this.playlist.splice(index, 1);
    this.playTrack(track);
  }

  private playTrack(track: Track): void {
    if (this.currentTrack) this.history.push(this.currentTrack);
    this.setCurrent(track);
  }

  private setCurrent(track: Track): void {
    this.currentTrack = track;
    this.audio.src = window.api.getMediaUrl(track.id);
    void this.audio.play();
    void window.api.trackPlayed(track.id);
    document.title = `${track.title} - ${track.artist} | DiodeDJ`;
    void this.maybeRefillPlaylist();
  }

  togglePlay(): void {
    if (!this.currentTrack) {
      if (this.playlist.length > 0) this.playIndex(0);
      return;
    }
    if (this.audio.paused) {
      this.audio.play().catch((err) => logger.error("Resume failed:", err));
    } else {
      this.audio.pause();
    }
  }

  stop(): void {
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.currentTrack = null;
    this.history.length = 0;
    this.autoPlaylistActive = false;
    this.currentTime = 0;
    this.duration = 0;
    document.title = "DiodeDJ";
  }

  next(): void {
    if (this.playlist.length > 0) this.playIndex(0);
  }

  prev(): void {
    if (this.currentTrack && this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }
    const previous = this.history.pop();
    if (!previous) {
      if (this.currentTrack) this.audio.currentTime = 0;
      return;
    }
    if (this.currentTrack) this.playlist.unshift(this.currentTrack);
    this.setCurrent(previous);
  }

  toggleMode(): void {
    this.autoAdvance = !this.autoAdvance;
  }

  toggleAutoPlaylist(): void {
    this.autoPlaylistActive = !this.autoPlaylistActive;
    if (this.autoPlaylistActive) {
      if (!this.currentTrack && this.playlist.length > 0) {
        this.playIndex(0);
      } else {
        void this.maybeRefillPlaylist();
      }
    }
  }

  async maybeRefillPlaylist(): Promise<void> {
    if (!this.autoPlaylistActive) return;
    if (this.playlist.length < AUTO_PLAYLIST_BUFFER) {
      const count = AUTO_PLAYLIST_BUFFER - this.playlist.length;
      const tracks = await window.api.generatePlaylist(count);
      this.playlist.push(...tracks);
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
    try {
      this.audio.currentTime = clamped * this.duration;
    } catch (err) {
      logger.error("Seek failed:", err);
    }
  }

  async loadStats(): Promise<void> {
    this.stats = await window.api.getStats();
  }

  async loadPaths(): Promise<void> {
    this.paths = await window.api.getAllPaths();
  }

  async addPath(type: ContentType): Promise<void> {
    const added = await window.api.addPath(type);
    if (added) await this.loadPaths();
  }

  async removePath(type: ContentType, p: string): Promise<void> {
    await window.api.removePath(type, p);
    await this.loadPaths();
  }

  async scan(): Promise<void> {
    this.scanOpen = true;
    this.scanProcessed = 0;
    this.scanTotal = 0;
    await window.api.scanLibrary();
    this.scanOpen = false;
    await this.search();
    await this.loadStats();
  }

  private async handleEnded(): Promise<void> {
    if (!this.autoAdvance) return;
    if (this.playlist.length > 0) {
      this.playIndex(0);
    } else if (this.autoPlaylistActive) {
      await this.maybeRefillPlaylist();
      if (this.playlist.length > 0) this.playIndex(0);
    } else {
      this.stop();
    }
  }
}

export const app = new AppState();

export function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
