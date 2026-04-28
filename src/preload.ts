import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  platform: process.platform,
  search: (
    query: string,
    contentType?: string,
    sortBy?: string,
    sortDir?: string,
  ) => ipcRenderer.invoke("search", query, contentType, sortBy, sortDir),
  getTrack: (id: number) => ipcRenderer.invoke("get-track", id),
  getTracksByIds: (ids: number[]) =>
    ipcRenderer.invoke("get-tracks-by-ids", ids),
  loadSession: () => ipcRenderer.invoke("load-session"),
  saveSession: (state: unknown) => ipcRenderer.invoke("save-session", state),
  trackPlayed: (id: number) => ipcRenderer.invoke("track-played", id),
  generatePlaylist: (count: number) =>
    ipcRenderer.invoke("generate-playlist", count),
  getStats: () => ipcRenderer.invoke("get-stats"),
  getPaths: (type: string) => ipcRenderer.invoke("get-paths", type),
  getAllPaths: () => ipcRenderer.invoke("get-all-paths"),
  addPath: (type: string) => ipcRenderer.invoke("add-path", type),
  removePath: (type: string, dirPath: string) =>
    ipcRenderer.invoke("remove-path", type, dirPath),
  scanLibrary: () => ipcRenderer.invoke("scan-library"),
  onScanProgress: (
    callback: (data: { processed: number; total: number }) => void,
  ) => {
    ipcRenderer.on("scan-progress", (_event, data) => callback(data));
  },
  getMediaUrl: (trackId: number) => `media://track/${trackId}`,
});
