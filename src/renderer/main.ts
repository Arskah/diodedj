import { mount } from "svelte";
import App from "./App.svelte";
import { api } from "./api";
import { app } from "./state.svelte";
import "./styles.css";

document.documentElement.dataset["platform"] = api.platform;

mount(App, { target: document.getElementById("app")! });

void app.search();
void app.loadStats();
void app.loadSession();
void app.hydrateScanStatus();

window.addEventListener("beforeunload", () => app.flushSave());
