import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ContentType,
  LibraryStats,
  ScanResult,
  SortColumn,
  SortDir,
  Track,
} from "../types";

export interface SessionPersistState {
  playlistIds: number[];
  historyIds: number[];
  currentTrackId: number | null;
  currentTime: number;
  autoPlaylistActive: boolean;
  autoAdvance: boolean;
  volume: number;
}

export interface SessionLoadResult {
  state: SessionPersistState;
  tracks: Track[];
}

export type ScanStatus =
  | { status: "idle"; lastResult: ScanResult | null }
  | { status: "running"; processed: number; total: number }
  | { status: "canceled"; processed: number; total: number; added: number }
  | { status: "error"; message: string };

export interface ScanProgress {
  processed: number;
  total: number;
}

function detectPlatform(): string {
  const ua =
    typeof navigator !== "undefined" ? navigator.userAgent.toLowerCase() : "";
  if (ua.includes("mac")) return "darwin";
  if (ua.includes("win")) return "win32";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

export const api = {
  platform: detectPlatform(),
  search(
    query: string,
    contentType?: ContentType,
    sortBy?: SortColumn,
    sortDir?: SortDir,
  ): Promise<Track[]> {
    return invoke<Track[]>("search", { query, contentType, sortBy, sortDir });
  },
  getTrack(id: number): Promise<Track> {
    return invoke<Track>("get_track", { id });
  },
  getTracksByIds(ids: number[]): Promise<Track[]> {
    return invoke<Track[]>("get_tracks_by_ids", { ids });
  },
  loadSession(): Promise<SessionLoadResult> {
    return invoke<SessionLoadResult>("load_session");
  },
  saveSession(state: SessionPersistState): Promise<void> {
    return invoke<void>("save_session", { state });
  },
  trackPlayed(id: number): Promise<void> {
    return invoke<void>("track_played", { id });
  },
  generatePlaylist(count: number): Promise<Track[]> {
    return invoke<Track[]>("generate_playlist", { count });
  },
  pickFiller(contentType: ContentType): Promise<Track | null> {
    return invoke<Track | null>("pick_filler", { contentType });
  },
  getStats(): Promise<LibraryStats> {
    return invoke<LibraryStats>("get_stats");
  },
  getPaths(type: ContentType): Promise<string[]> {
    return invoke<string[]>("get_paths", { type });
  },
  getAllPaths(): Promise<Record<ContentType, string[]>> {
    return invoke<Record<ContentType, string[]>>("get_all_paths");
  },
  addPath(type: ContentType): Promise<string | null> {
    return invoke<string | null>("add_path", { type });
  },
  removePath(type: ContentType, dirPath: string): Promise<boolean> {
    return invoke<boolean>("remove_path", { type, dirPath });
  },
  scanLibrary(): Promise<{ alreadyRunning: boolean }> {
    return invoke<{ alreadyRunning: boolean }>("scan_library");
  },
  cancelScan(): Promise<void> {
    return invoke<void>("cancel_scan");
  },
  getScanStatus(): Promise<ScanStatus> {
    return invoke<ScanStatus>("get_scan_status");
  },
  onScanProgress(callback: (data: ScanProgress) => void): Promise<UnlistenFn> {
    return listen<ScanProgress>("scan-progress", (e) => callback(e.payload));
  },
  onScanStateChanged(
    callback: (data: ScanStatus) => void,
  ): Promise<UnlistenFn> {
    return listen<ScanStatus>("scan-state-changed", (e) => callback(e.payload));
  },
  getMediaUrl(trackId: number): string {
    return convertFileSrc(String(trackId), "media");
  },
};

export type Api = typeof api;
