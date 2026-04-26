import { app, BrowserWindow, ipcMain, protocol, net, dialog } from "electron";
import { pathToFileURL } from "url";
import path from "path";
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
  ipcMain.handle("search", (_event, query: string) => {
    return db.search(query);
  });

  ipcMain.handle("get-track", (_event, id: number) => {
    return db.getTrack(id);
  });

  ipcMain.handle("generate-playlist", (_event, count: number) => {
    return playlist.generate(count);
  });

  ipcMain.handle("get-stats", () => {
    return db.getStats();
  });

  ipcMain.handle("get-library-paths", () => {
    return config.getLibraryPaths();
  });

  ipcMain.handle("add-library-path", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Select Music Library Folder",
    });
    if (result.canceled) return null;
    const dirPath = result.filePaths[0];
    config.addLibraryPath(dirPath);
    return dirPath;
  });

  ipcMain.handle("remove-library-path", (_event, dirPath: string) => {
    return config.removeLibraryPath(dirPath);
  });

  ipcMain.handle("scan-library", async (_event, dirPath?: string) => {
    const paths = dirPath ? [dirPath] : config.getLibraryPaths();

    // Remove tracks from paths no longer in config
    const configPaths = config.getLibraryPaths();
    db.removeTracksNotInPaths(configPaths);

    const totalResult = { total: 0, added: 0 };

    for (const p of paths) {
      let lastReport = 0;
      const result = await scanner.scanDirectory(p, (processed, total) => {
        const now = Date.now();
        if (now - lastReport > 200) {
          lastReport = now;
          mainWindow.webContents.send("scan-progress", { processed, total });
        }
      });
      totalResult.total += result.total;
      totalResult.added += result.added;
    }

    return totalResult;
  });
}

app.on("window-all-closed", () => {
  db.close();
  app.quit();
});
