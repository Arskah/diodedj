import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "main",
    environment: "node",
    include: ["**/*.test.ts"],
  },
});
