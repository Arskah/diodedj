import type { ContentType, LibraryStats } from "../types";

export type Track = {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  play_count: number;
};

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
  currentIndex = $state(-1);
  autoPlaylistActive = $state(false);
  autoAdvance = $state(true);
  isPlaying = $state(false);
  volume = $state(1);
  currentTime = $state(0);
  duration = $state(0);

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
          : (this.playlist[this.currentIndex]?.duration ?? 0);
    });
    this.audio.addEventListener("ended", () => {
      void this.handleEnded();
    });
    this.audio.addEventListener("error", () => {
      const err = this.audio.error;
      console.error("Audio error:", {
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

  get currentTrack(): Track | null {
    return this.currentIndex >= 0
      ? (this.playlist[this.currentIndex] ?? null)
      : null;
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
    this.addToPlaylist(track);
    this.playIndex(this.playlist.length - 1);
  }

  removeFromPlaylist(index: number): void {
    this.playlist.splice(index, 1);
    if (index < this.currentIndex) {
      this.currentIndex--;
    } else if (index === this.currentIndex) {
      this.stop();
      this.currentIndex = -1;
    }
  }

  movePlaylistItem(from: number, to: number): void {
    if (from === to) return;
    const [item] = this.playlist.splice(from, 1);
    this.playlist.splice(to, 0, item);
    if (this.currentIndex === from) {
      this.currentIndex = to;
    } else if (from < this.currentIndex && to >= this.currentIndex) {
      this.currentIndex--;
    } else if (from > this.currentIndex && to <= this.currentIndex) {
      this.currentIndex++;
    }
  }

  clearPlaylist(): void {
    this.stop();
    this.playlist.length = 0;
  }

  playIndex(index: number): void {
    if (index < 0 || index >= this.playlist.length) return;
    this.currentIndex = index;
    const track = this.playlist[index];
    this.audio.src = window.api.getMediaUrl(track.id);
    void this.audio.play();
    void window.api.trackPlayed(track.id);
    document.title = `${track.title} - ${track.artist} | DiodeDJ`;
    void this.maybeRefillPlaylist();
  }

  togglePlay(): void {
    if (this.currentIndex === -1) {
      if (this.playlist.length > 0) this.playIndex(0);
      return;
    }
    if (this.audio.paused) {
      this.audio.play().catch((err) => console.error("Resume failed:", err));
    } else {
      this.audio.pause();
    }
  }

  stop(): void {
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.currentIndex = -1;
    this.autoPlaylistActive = false;
    this.currentTime = 0;
    this.duration = 0;
    document.title = "DiodeDJ";
  }

  next(): void {
    if (this.currentIndex < this.playlist.length - 1) {
      this.playIndex(this.currentIndex + 1);
    }
  }

  prev(): void {
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
    } else if (this.currentIndex > 0) {
      this.playIndex(this.currentIndex - 1);
    }
  }

  toggleMode(): void {
    this.autoAdvance = !this.autoAdvance;
  }

  toggleAutoPlaylist(): void {
    this.autoPlaylistActive = !this.autoPlaylistActive;
    if (this.autoPlaylistActive) {
      void this.maybeRefillPlaylist();
      if (this.currentIndex === -1 && this.playlist.length > 0) {
        this.playIndex(0);
      }
    }
  }

  async maybeRefillPlaylist(): Promise<void> {
    if (!this.autoPlaylistActive) return;
    const remaining = this.playlist.length - this.currentIndex - 1;
    if (remaining < AUTO_PLAYLIST_BUFFER) {
      const count = AUTO_PLAYLIST_BUFFER - remaining;
      const tracks = await window.api.generatePlaylist(count);
      this.playlist.push(...tracks);
    }
  }

  seekToPct(pct: number): void {
    if (!this.duration) return;
    const clamped = Math.min(1, Math.max(0, pct));
    try {
      this.audio.currentTime = clamped * this.duration;
    } catch (err) {
      console.error("Seek failed:", err);
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
    if (this.currentIndex < this.playlist.length - 1) {
      this.playIndex(this.currentIndex + 1);
    } else if (this.autoPlaylistActive) {
      await this.maybeRefillPlaylist();
      if (this.currentIndex < this.playlist.length - 1) {
        this.playIndex(this.currentIndex + 1);
      }
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
