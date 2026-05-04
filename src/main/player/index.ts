import { BrowserWindow, ipcMain } from "electron";
import * as db from "../db";
import { logger } from "../logger";
import { NativePlayer, NativePlayerEvent } from "./native";

let player: NativePlayer | null = null;

export async function start(): Promise<void> {
  if (player) return;
  try {
    player = new NativePlayer();
    player.start();
    logger.info("native player started");
  } catch (err) {
    logger.error("native player start failed", err);
    player = null;
  }
}

export async function dispose(): Promise<void> {
  if (!player) return;
  await player.dispose();
  player = null;
}

function require_(): NativePlayer {
  if (!player) throw new Error("native player not started");
  return player;
}

export function register(mainWindow: BrowserWindow): void {
  player?.on((event) => forward(mainWindow, event));

  ipcMain.handle("player:main:load", async (_event, trackId: number) => {
    const track = await db.getTrack(trackId);
    if (!track) throw new Error(`track ${trackId} not found`);
    await require_().load(track.path, track.duration ?? 0);
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

function forward(mainWindow: BrowserWindow, event: NativePlayerEvent): void {
  if (mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("player:main:event", event);
}
