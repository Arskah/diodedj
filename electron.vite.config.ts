import { defineConfig } from "electron-vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    build: {
      sourcemap: true,
      lib: {
        entry: resolve(__dirname, "src/main/main.ts"),
      },
    },
  },
  preload: {
    build: {
      sourcemap: true,
      lib: {
        entry: resolve(__dirname, "src/preload.ts"),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [svelte()],
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
        },
      },
    },
  },
});
