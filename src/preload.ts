import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  search: (query: string) => ipcRenderer.invoke("search", query),
  getTrack: (id: number) => ipcRenderer.invoke("get-track", id),
  generatePlaylist: (count: number) =>
    ipcRenderer.invoke("generate-playlist", count),
  getStats: () => ipcRenderer.invoke("get-stats"),
  getLibraryPaths: () => ipcRenderer.invoke("get-library-paths"),
  addLibraryPath: () => ipcRenderer.invoke("add-library-path"),
  removeLibraryPath: (dirPath: string) =>
    ipcRenderer.invoke("remove-library-path", dirPath),
  scanLibrary: (dirPath?: string) =>
    ipcRenderer.invoke("scan-library", dirPath),
  onScanProgress: (
    callback: (data: { processed: number; total: number }) => void,
  ) => {
    ipcRenderer.on("scan-progress", (_event, data) => callback(data));
  },
  getMediaUrl: (trackId: number) => `media://track/${trackId}`,
});
