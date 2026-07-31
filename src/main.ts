import { mount } from "svelte";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { attachConsole } from "@tauri-apps/plugin-log";
import App from "./App.svelte";
import { api } from "./shared/api";
import { app } from "./shared/state.svelte";
// Self-hosted fonts + icons (bundled, no CDN — desktop app runs offline).
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "material-symbols/outlined.css";
import "./styles.css";

void attachConsole();

mount(App, { target: document.getElementById("app")! });

void app.search();
void app.loadStats();
void app.loadSession();
void app.hydrateScanStatus();
void app.hydrateWaveformStatus();
void app.loadAudioConfig();

const win = getCurrentWindow();
let closing = false;
void win.onCloseRequested(async (event) => {
  if (closing) return;
  closing = true;
  event.preventDefault();
  try {
    await app.flushSave();
    await api.broadcastShutdown();
  } finally {
    await win.destroy();
  }
});
