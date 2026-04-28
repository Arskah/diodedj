import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte({ configFile: "../../svelte.config.mjs" })],
  test: {
    name: "renderer",
    environment: "jsdom",
    include: ["**/*.test.ts"],
  },
});
