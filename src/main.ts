import { mount } from "svelte";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { attachConsole } from "@tauri-apps/plugin-log";
import App from "./App.svelte";
import { app } from "./shared/state.svelte";
import "./styles.css";

void attachConsole();

mount(App, { target: document.getElementById("app")! });

void app.search();
void app.loadStats();
void app.loadSession();
void app.hydrateScanStatus();
void app.loadAudioConfig();

const win = getCurrentWindow();
let closing = false;
void win.onCloseRequested(async (event) => {
  if (closing) return;
  closing = true;
  event.preventDefault();
  try {
    await app.flushSave();
  } finally {
    await win.destroy();
  }
});
