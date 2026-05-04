import { contextBridge, ipcRenderer } from "electron";
import type { PlayerEvent } from "./types";

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
  pickFiller: (contentType: string) =>
    ipcRenderer.invoke("pick-filler", contentType),
  getStats: () => ipcRenderer.invoke("get-stats"),
  getPaths: (type: string) => ipcRenderer.invoke("get-paths", type),
  getAllPaths: () => ipcRenderer.invoke("get-all-paths"),
  addPath: (type: string) => ipcRenderer.invoke("add-path", type),
  removePath: (type: string, dirPath: string) =>
    ipcRenderer.invoke("remove-path", type, dirPath),
  scanLibrary: () => ipcRenderer.invoke("scan-library"),
  cancelScan: () => ipcRenderer.invoke("cancel-scan"),
  getScanStatus: () => ipcRenderer.invoke("get-scan-status"),
  onScanProgress: (
    callback: (data: { processed: number; total: number }) => void,
  ) => {
    ipcRenderer.on("scan-progress", (_event, data) => callback(data));
  },
  onScanStateChanged: (callback: (data: unknown) => void) => {
    ipcRenderer.on("scan-state-changed", (_event, data) => callback(data));
  },
  player: {
    load: (trackId: number) => ipcRenderer.invoke("player:main:load", trackId),
    play: () => ipcRenderer.invoke("player:main:play"),
    pause: () => ipcRenderer.invoke("player:main:pause"),
    stop: () => ipcRenderer.invoke("player:main:stop"),
    seek: (seconds: number) => ipcRenderer.invoke("player:main:seek", seconds),
    setVolume: (volume: number) =>
      ipcRenderer.invoke("player:main:set-volume", volume),
    onEvent: (callback: (event: PlayerEvent) => void) => {
      ipcRenderer.on("player:main:event", (_event, data) =>
        callback(data as PlayerEvent),
      );
    },
  },
});
