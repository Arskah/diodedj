import { BrowserWindow, ipcMain, dialog, IpcMainInvokeEvent } from "electron";
import { ContentType } from "../types";
import * as db from "./db";
import * as config from "./config";
import * as scanner from "./scanner";
import * as playlist from "./playlist";
import { logger } from "./logger";

type Handler = (
  event: IpcMainInvokeEvent,
  ...args: unknown[]
) => unknown | Promise<unknown>;

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
  handle("search", async (_event, ...args) => {
    const [query, contentType] = args as [string, ContentType?];
    return db.search(query, contentType);
  });

  handle("get-track", async (_event, ...args) => {
    const [id] = args as [number];
    return db.getTrack(id);
  });

  handle("track-played", async (_event, ...args) => {
    const [id] = args as [number];
    await db.incrementPlayCount(id);
  });

  handle("generate-playlist", async (_event, ...args) => {
    const [count] = args as [number];
    return playlist.generate(count);
  });

  handle("get-stats", async () => {
    return db.getStats();
  });

  handle("get-paths", (_event, ...args) => {
    const [type] = args as [ContentType];
    return config.getPaths(type);
  });

  handle("get-all-paths", () => {
    return config.getAllPaths();
  });

  handle("add-path", async (_event, ...args) => {
    const [type] = args as [ContentType];
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

  handle("remove-path", (_event, ...args) => {
    const [type, dirPath] = args as [ContentType, string];
    return config.removePath(type, dirPath);
  });

  handle("scan-library", async () => {
    const allPaths = config.getAllPathsFlat();
    await db.removeTracksNotInPaths(allPaths);

    const totalResult = { total: 0, added: 0 };
    const types: ContentType[] = ["music", "commercial", "jingle"];

    for (const type of types) {
      const paths = config.getPaths(type);
      for (const p of paths) {
        let lastReport = 0;
        const result = await scanner.scanDirectory(
          p,
          type,
          (processed, total) => {
            const now = Date.now();
            if (now - lastReport > 200) {
              lastReport = now;
              mainWindow.webContents.send("scan-progress", {
                processed,
                total,
              });
            }
          },
        );
        totalResult.total += result.total;
        totalResult.added += result.added;
      }
    }

    logger.info(
      `scan complete: ${totalResult.added}/${totalResult.total} added across ${types.length} types`,
    );
    return totalResult;
  });
}
