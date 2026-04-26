import { app, BrowserWindow, ipcMain, protocol, dialog } from "electron";
import path from "path";
import fs from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { ContentType } from "../types";
import * as db from "./db";
import * as config from "./config";
import * as scanner from "./scanner";
import * as playlist from "./playlist";
import { needsTranscode, transcodeToWav } from "./transcode";

const MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  flac: "audio/flac",
  webm: "audio/webm",
};

protocol.registerSchemesAsPrivileged([
  { scheme: "media", privileges: { stream: true, supportFetchAPI: true } },
]);

let mainWindow: BrowserWindow;

app.whenReady().then(() => {
  db.init();
  config.init();

  protocol.handle("media", async (request) => {
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

    const stats = await stat(track.path);
    const total = stats.size;
    const contentType = MIME[track.format] || "application/octet-stream";
    const range = request.headers.get("range");

    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (match) {
        const start = parseInt(match[1]);
        const end = match[2] ? parseInt(match[2]) : total - 1;
        const nodeStream = fs.createReadStream(track.path, { start, end });
        return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
          status: 206,
          headers: {
            "Content-Type": contentType,
            "Content-Length": String(end - start + 1),
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Accept-Ranges": "bytes",
          },
        });
      }
    }

    const nodeStream = fs.createReadStream(track.path);
    return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(total),
        "Accept-Ranges": "bytes",
      },
    });
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
