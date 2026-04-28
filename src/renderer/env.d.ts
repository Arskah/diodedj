declare module "*.css";
declare module "*.svelte" {
  import type { Component } from "svelte";
  const component: Component;
  export default component;
}

type ContentType = "music" | "commercial" | "jingle";
type SortColumn = "title" | "artist" | "album" | "play_count";
type SortDir = "asc" | "desc";

interface ElectronAPI {
  platform: NodeJS.Platform;
  search(
    query: string,
    contentType?: ContentType,
    sortBy?: SortColumn,
    sortDir?: SortDir,
  ): Promise<import("../types").Track[]>;
  getTrack(id: number): Promise<import("../types").Track>;
  trackPlayed(id: number): Promise<void>;
  generatePlaylist(count: number): Promise<import("../types").Track[]>;
  getStats(): Promise<import("../types").LibraryStats>;
  getPaths(type: ContentType): Promise<string[]>;
  getAllPaths(): Promise<Record<ContentType, string[]>>;
  addPath(type: ContentType): Promise<string | null>;
  removePath(type: ContentType, dirPath: string): Promise<boolean>;
  scanLibrary(): Promise<import("../types").ScanResult>;
  onScanProgress(
    callback: (data: { processed: number; total: number }) => void,
  ): void;
  getMediaUrl(trackId: number): string;
}

interface Window {
  api: ElectronAPI;
}
