import {
  app,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
} from "electron";
import path from "path";
import windowStateKeeper from "electron-window-state";

const TITLEBAR_BG = "#1a1a2e";
const TITLEBAR_SYMBOL = "#e8e8e8";
const TITLEBAR_HEIGHT = 50;
const LINUX_FALLBACK_BG = "#0f0f1a";

export function createMainWindow(): BrowserWindow {
  if (!app.isReady()) {
    throw new Error("createMainWindow must be called after app is ready");
  }

  const state = windowStateKeeper({
    defaultWidth: 1200,
    defaultHeight: 800,
  });

  const platformOpts: BrowserWindowConstructorOptions =
    process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset",
          trafficLightPosition: { x: 12, y: 18 },
          vibrancy: "under-window",
          visualEffectState: "active",
        }
      : process.platform === "win32"
        ? {
            titleBarOverlay: {
              color: TITLEBAR_BG,
              symbolColor: TITLEBAR_SYMBOL,
              height: TITLEBAR_HEIGHT,
            },
            backgroundMaterial: "mica",
          }
        : {
            titleBarOverlay: {
              color: TITLEBAR_BG,
              symbolColor: TITLEBAR_SYMBOL,
              height: TITLEBAR_HEIGHT,
            },
            backgroundColor: LINUX_FALLBACK_BG,
          };

  const mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 800,
    minHeight: 600,
    title: "DiodeDJ",
    show: false,
    paintWhenInitiallyHidden: true,
    ...platformOpts,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  state.manage(mainWindow);
  mainWindow.once("ready-to-show", () => mainWindow.show());

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  if (!app.isPackaged && process.env["NODE_ENV"] !== "test") {
    mainWindow.webContents.openDevTools();
  }

  return mainWindow;
}
