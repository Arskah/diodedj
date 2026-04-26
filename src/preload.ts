import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  search: (query: string) => ipcRenderer.invoke('search', query),
  getTrack: (id: number) => ipcRenderer.invoke('get-track', id),
  generatePlaylist: (count: number) => ipcRenderer.invoke('generate-playlist', count),
  getStats: () => ipcRenderer.invoke('get-stats'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanLibrary: (dirPath: string) => ipcRenderer.invoke('scan-library', dirPath),
  onScanProgress: (callback: (data: { processed: number; total: number }) => void) => {
    ipcRenderer.on('scan-progress', (_event, data) => callback(data));
  },
  getMediaUrl: (trackId: number) => `media://track/${trackId}`
});
