interface ElectronAPI {
  search(query: string): Promise<import('../types').Track[]>;
  getTrack(id: number): Promise<import('../types').Track>;
  generatePlaylist(count: number): Promise<import('../types').Track[]>;
  getStats(): Promise<import('../types').LibraryStats>;
  getLibraryPaths(): Promise<string[]>;
  addLibraryPath(): Promise<string | null>;
  removeLibraryPath(dirPath: string): Promise<boolean>;
  scanLibrary(dirPath?: string): Promise<import('../types').ScanResult>;
  onScanProgress(callback: (data: { processed: number; total: number }) => void): void;
  getMediaUrl(trackId: number): string;
}

interface Window {
  api: ElectronAPI;
}
