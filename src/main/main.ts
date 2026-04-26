import { app, BrowserWindow, ipcMain, protocol, net, dialog } from "electron";
import { pathToFileURL } from "url";
import path from "path";
import { ContentType } from "../types";
import * as db from "./db";
import * as config from "./config";
import * as scanner from "./scanner";
import * as playlist from "./playlist";
import { needsTranscode, transcodeToWav } from "./transcode";

protocol.registerSchemesAsPrivileged([
  { scheme: "media", privileges: { stream: true, supportFetchAPI: true } },
]);

let mainWindow: BrowserWindow;

app.whenReady().then(() => {
  db.init();
  config.init();

  protocol.handle("media", (request) => {
    const url = new URL(request.url);
    const id = parseInt(url.pathname.replace(/^\/+/, ""));
    const track = db.getTrack(id);
    if (!track) return new Response("Not found", { status: 404 });

    if (needsTranscode(track.format)) {
      const stream = transcodeToWav(track.path);
      return new Response(stream, {
        headers: { "Content-Type": "audio/wav" },
      });
    }

    return net.fetch(pathToFileURL(track.path).href);
  });

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "DiodeDJ",
    backgroundColor: "#0f0f1a",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  setupIPC();
});

function setupIPC(): void {
  ipcMain.handle(
    "search",
    (_event, query: string, contentType?: ContentType) => {
      return db.search(query, contentType);
    },
  );

  ipcMain.handle("get-track", (_event, id: number) => {
    return db.getTrack(id);
  });

  ipcMain.handle("track-played", (_event, id: number) => {
    db.incrementPlayCount(id);
  });

  ipcMain.handle("generate-playlist", (_event, count: number) => {
    return playlist.generate(count);
  });

  ipcMain.handle("get-stats", () => {
    return db.getStats();
  });

  ipcMain.handle("get-paths", (_event, type: ContentType) => {
    return config.getPaths(type);
  });

  ipcMain.handle("get-all-paths", () => {
    return config.getAllPaths();
  });

  ipcMain.handle("add-path", async (_event, type: ContentType) => {
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

  ipcMain.handle(
    "remove-path",
    (_event, type: ContentType, dirPath: string) => {
      return config.removePath(type, dirPath);
    },
  );

  ipcMain.handle("scan-library", async () => {
    // Prune tracks from removed paths
    const allPaths = config.getAllPathsFlat();
    db.removeTracksNotInPaths(allPaths);

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

    return totalResult;
  });
}

app.on("window-all-closed", () => {
  db.close();
  app.quit();
});
