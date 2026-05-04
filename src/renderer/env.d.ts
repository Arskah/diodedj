declare module "*.css";
declare module "*.svelte" {
  import type { Component } from "svelte";
  const component: Component;
  export default component;
}

type ContentType = "music" | "commercial" | "jingle";
type SortColumn = "title" | "artist" | "album" | "play_count";
type SortDir = "asc" | "desc";

interface SessionPersistState {
  playlistIds: number[];
  historyIds: number[];
  currentTrackId: number | null;
  currentTime: number;
  autoPlaylistActive: boolean;
  autoAdvance: boolean;
  volume: number;
}

interface SessionLoadResult {
  state: SessionPersistState;
  tracks: import("../types").Track[];
}

type ScanStatus =
  | { status: "idle"; lastResult: import("../types").ScanResult | null }
  | { status: "running"; processed: number; total: number }
  | {
      status: "canceled";
      processed: number;
      total: number;
      added: number;
    }
  | { status: "error"; message: string };

interface ElectronAPI {
  platform: NodeJS.Platform;
  search(
    query: string,
    contentType?: ContentType,
    sortBy?: SortColumn,
    sortDir?: SortDir,
  ): Promise<import("../types").Track[]>;
  getTrack(id: number): Promise<import("../types").Track>;
  getTracksByIds(ids: number[]): Promise<import("../types").Track[]>;
  loadSession(): Promise<SessionLoadResult>;
  saveSession(state: SessionPersistState): Promise<void>;
  trackPlayed(id: number): Promise<void>;
  generatePlaylist(count: number): Promise<import("../types").Track[]>;
  getStats(): Promise<import("../types").LibraryStats>;
  getPaths(type: ContentType): Promise<string[]>;
  getAllPaths(): Promise<Record<ContentType, string[]>>;
  addPath(type: ContentType): Promise<string | null>;
  removePath(type: ContentType, dirPath: string): Promise<boolean>;
  scanLibrary(): Promise<{ alreadyRunning: boolean }>;
  cancelScan(): Promise<void>;
  getScanStatus(): Promise<ScanStatus>;
  onScanProgress(
    callback: (data: { processed: number; total: number }) => void,
  ): void;
  onScanStateChanged(callback: (data: ScanStatus) => void): void;
  getMediaUrl(trackId: number): string;
}

interface Window {
  api: ElectronAPI;
}
