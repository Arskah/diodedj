import { BrowserWindow, ipcMain } from "electron";
import * as db from "../db";
import { logger } from "../logger";
import { resolveMpvBinary, MpvBinaryNotFound } from "./binary";
import { Mpv, MpvEvent } from "./mpv";

let mpv: Mpv | null = null;

export async function start(): Promise<void> {
  if (mpv) return;
  try {
    const binary = resolveMpvBinary();
    mpv = new Mpv({ binary });
    await mpv.start();
    logger.info(`mpv started binary=${binary}`);
  } catch (err) {
    logger.error("mpv start failed", err);
    mpv = null;
  }
}

export async function dispose(): Promise<void> {
  if (!mpv) return;
  await mpv.dispose();
  mpv = null;
}

function require_(): Mpv {
  if (!mpv) throw new Error("mpv not started");
  return mpv;
}

export function register(mainWindow: BrowserWindow): void {
  mpv?.on((event) => forward(mainWindow, event));

  ipcMain.handle("player:main:load", async (_event, trackId: number) => {
    const track = await db.getTrack(trackId);
    if (!track) throw new Error(`track ${trackId} not found`);
    await require_().load(track.path);
  });
  ipcMain.handle("player:main:play", () => require_().play());
  ipcMain.handle("player:main:pause", () => require_().pause());
  ipcMain.handle("player:main:stop", () => require_().stop());
  ipcMain.handle("player:main:seek", (_event, seconds: number) =>
    require_().seek(seconds),
  );
  ipcMain.handle("player:main:set-volume", (_event, volume: number) =>
    require_().setVolume(volume),
  );
}

function forward(mainWindow: BrowserWindow, event: MpvEvent): void {
  if (mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("player:main:event", event);
}

export { MpvBinaryNotFound };
