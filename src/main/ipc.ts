import { BrowserWindow, ipcMain, dialog, IpcMainInvokeEvent } from "electron";
import { ContentType, SortColumn, SortDir } from "../types";
import * as db from "./db";
import * as config from "./config";
import * as scanState from "./scanState";
import * as playlist from "./playlist";
import * as session from "./session";
import { logger } from "./logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (event: IpcMainInvokeEvent, ...args: any[]) => unknown;

function handle(channel: string, handler: Handler): void {
  ipcMain.handle(channel, async (event, ...args) => {
    logger.debug(`ipc:${channel}`, ...args);
    try {
      return await handler(event, ...args);
    } catch (err) {
      logger.error(`ipc:${channel} failed`, err);
      throw err;
    }
  });
}

export function register(mainWindow: BrowserWindow): void {
  handle(
    "search",
    async (
      _event,
      query: string,
      contentType?: ContentType,
      sortBy?: SortColumn,
      sortDir?: SortDir,
    ) => {
      return db.search(query, contentType, sortBy, sortDir);
    },
  );

  handle("get-track", async (_event, id: number) => {
    return db.getTrack(id);
  });

  handle("get-tracks-by-ids", async (_event, ids: number[]) => {
    return db.getTracksByIds(ids);
  });

  handle("load-session", async () => {
    const state = session.load();
    const ids = Array.from(
      new Set([
        ...state.playlistIds,
        ...state.historyIds,
        ...(state.currentTrackId !== null ? [state.currentTrackId] : []),
      ]),
    );
    const tracks = await db.getTracksByIds(ids);
    return { state, tracks };
  });

  handle("save-session", (_event, state: session.SessionState) => {
    session.save(state);
  });

  handle("track-played", async (_event, id: number) => {
    await db.incrementPlayCount(id);
  });

  handle("generate-playlist", async (_event, count: number) => {
    return playlist.generate(count);
  });

  handle("get-stats", async () => {
    return db.getStats();
  });

  handle("get-paths", (_event, type: ContentType) => {
    return config.getPaths(type);
  });

  handle("get-all-paths", () => {
    return config.getAllPaths();
  });

  handle("add-path", async (_event, type: ContentType) => {
    const labels: Record<ContentType, string> = {
      music: "Music",
      commercial: "Commercials",
      jingle: "Jingles",
    };
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: `Select ${labels[type]} Folder`,
    });
    if (result.canceled) return null;
    const dirPath = result.filePaths[0];
    config.addPath(type, dirPath);
    return dirPath;
  });

  handle("remove-path", (_event, type: ContentType, dirPath: string) => {
    if (scanState.isRunning()) {
      throw new Error("Cannot remove path while scan is running");
    }
    return config.removePath(type, dirPath);
  });

  handle("scan-library", () => {
    return scanState.start();
  });

  handle("cancel-scan", async () => {
    await scanState.cancel();
  });

  handle("get-scan-status", () => {
    return scanState.getStatus();
  });

  scanState.onChange((s) => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("scan-state-changed", s);
  });

  scanState.onProgress((p) => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("scan-progress", p);
  });
}
