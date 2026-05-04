import { mount } from "svelte";
import App from "./App.svelte";
import { app } from "./state.svelte";
import "./styles.css";

document.documentElement.dataset["platform"] = window.api.platform;

mount(App, { target: document.getElementById("app")! });

void app.search();
void app.loadStats();
void app.loadSession();
void app.hydrateScanStatus();

window.addEventListener("beforeunload", () => app.flushSave());
