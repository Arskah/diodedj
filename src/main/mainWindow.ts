import { app, BrowserWindow } from "electron";
import path from "path";

export function createMainWindow(): BrowserWindow {
  if (!app.isReady()) {
    throw new Error("createMainWindow must be called after app is ready");
  }

  const mainWindow = new BrowserWindow({
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

  return mainWindow;
}
