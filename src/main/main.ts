import { app } from "electron";
import * as db from "./db";
import * as config from "./config";
import * as scanState from "./scanState";
import * as ipc from "./ipc";
import * as player from "./player";
import { logger, init as initLogger, close as closeLogger } from "./logger";
import { createMainWindow } from "./mainWindow";

app.on("ready", async () => {
  initLogger(app.getVersion());
  await db.init();
  config.init();
  await player.start();
  const win = createMainWindow();
  logger.info("main window created");
  player.register(win);
  ipc.register(win);
});

app.on("window-all-closed", async () => {
  logger.info("all windows closed; quitting");
  await scanState.cancel();
  await player.dispose();
  await db.close();
  closeLogger();
  app.quit();
});

app.on("before-quit", () => {
  logger.info("app before-quit");
});
