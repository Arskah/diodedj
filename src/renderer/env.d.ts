interface ElectronAPI {
  search(query: string): Promise<import('../types').Track[]>;
  getTrack(id: number): Promise<import('../types').Track>;
  generatePlaylist(count: number): Promise<import('../types').Track[]>;
  getStats(): Promise<import('../types').LibraryStats>;
  selectFolder(): Promise<string | null>;
  scanLibrary(dirPath: string): Promise<import('../types').ScanResult>;
  onScanProgress(callback: (data: { processed: number; total: number }) => void): void;
  getMediaUrl(trackId: number): string;
}

interface Window {
  api: ElectronAPI;
}
