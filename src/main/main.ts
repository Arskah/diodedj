import { app, protocol } from "electron";
import fs from "fs";
import { stat } from "fs/promises";
import * as db from "./db";
import * as config from "./config";
import {
  shouldTranscode,
  transcodeRange,
  transcodeToWav,
  transcodedTotalSize,
} from "./transcode";
import { MIME_TYPES } from "./audio-formats";
import * as ipc from "./ipc";
import { logger, init as initLogger, close as closeLogger } from "./logger";
import { createMainWindow } from "./mainWindow";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "media",
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
]);

const mediaHandler = async (request: Request) => {
  const url = new URL(request.url);
  const id = parseInt(url.pathname.replace(/^\/+/, ""));
  const track = await db.getTrack(id);
  if (!track) return new Response("Not found", { status: 404 });

  const transcoding = await shouldTranscode(track.format, track.path);

  // No-duration transcode fallback: stream the whole WAV with no Range
  // support. Browser can play sequentially but cannot seek.
  if (transcoding && (!track.duration || track.duration <= 0)) {
    return new Response(transcodeToWav(track.path), {
      headers: { "Content-Type": "audio/wav" },
    });
  }

  const total = transcoding
    ? transcodedTotalSize(track.duration)
    : (await stat(track.path)).size;
  const contentType = transcoding
    ? "audio/wav"
    : MIME_TYPES[track.format] || "application/octet-stream";

  const range = request.headers.get("range");
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

  if (transcoding) {
    const body = transcodeRange(track.path, track.duration, start, end);
    return new Response(body, { status, headers });
  }

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
};

app.on("ready", async () => {
  initLogger(app.getVersion());
  await db.init();
  config.init();
  protocol.handle("media", mediaHandler);
  const win = createMainWindow();
  logger.info("main window created");
  ipc.register(win);
});

app.on("window-all-closed", async () => {
  logger.info("all windows closed; quitting");
  await db.close();
  closeLogger();
  app.quit();
});

app.on("before-quit", () => {
  logger.info("app before-quit");
});
