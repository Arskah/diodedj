import { app, BrowserWindow, protocol } from "electron";
import path from "path";
import fs from "fs";
import { stat } from "fs/promises";
import * as db from "./db";
import * as config from "./config";
import { needsTranscode, transcodeToWav } from "./transcode";
import { MIME_TYPES } from "./audio-formats";
import * as ipc from "./ipc";

protocol.registerSchemesAsPrivileged([
  { scheme: "media", privileges: { stream: true, supportFetchAPI: true } },
]);

let mainWindow: BrowserWindow;

app.whenReady().then(async () => {
  await db.init();
  config.init();

  protocol.handle("media", async (request) => {
    const url = new URL(request.url);
    const id = parseInt(url.pathname.replace(/^\/+/, ""));
    const track = await db.getTrack(id);
    if (!track) return new Response("Not found", { status: 404 });

    if (needsTranscode(track.format)) {
      const stream = transcodeToWav(track.path);
      return new Response(stream, {
        headers: { "Content-Type": "audio/wav" },
      });
    }

    const range = request.headers.get("range");
    const stats = await stat(track.path);
    const total = stats.size;
    const contentType = MIME_TYPES[track.format] || "application/octet-stream";

    let start = 0;
    let end = total - 1;
    let status = 200;
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
    };

    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (match) {
        start = parseInt(match[1]);
        end = match[2] ? parseInt(match[2]) : total - 1;
        if (end >= total) end = total - 1;
        if (start > end) {
          return new Response("Range Not Satisfiable", {
            status: 416,
            headers: { "Content-Range": `bytes */${total}` },
          });
        }
        status = 206;
        headers["Content-Range"] = `bytes ${start}-${end}/${total}`;
      }
    }

    const length = end - start + 1;
    headers["Content-Length"] = String(length);

    const fd = await fs.promises.open(track.path, "r");
    try {
      const buf = Buffer.alloc(length);
      await fd.read(buf, 0, length, start);
      const ab = buf.buffer.slice(
        buf.byteOffset,
        buf.byteOffset + buf.byteLength,
      );
      return new Response(ab, { status, headers });
    } finally {
      await fd.close();
    }
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

  if (!app.isPackaged && process.env.NODE_ENV !== "test") {
    mainWindow.webContents.openDevTools();
  }

  ipc.register(mainWindow);
});

app.on("window-all-closed", async () => {
  await db.close();
  app.quit();
});
