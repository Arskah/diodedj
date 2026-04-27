import { mount } from "svelte";
import App from "./App.svelte";
import { app } from "./state.svelte";
import "./styles.css";

mount(App, { target: document.getElementById("app")! });

void app.search();
void app.loadStats();
