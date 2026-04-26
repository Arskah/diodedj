import { copyFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { argv } from "node:process";

export const ASSETS = ["index.html", "styles.css"];

export function copyAssets() {
  mkdirSync("dist/renderer", { recursive: true });
  for (const file of ASSETS) {
    copyFileSync(`src/renderer/${file}`, `dist/renderer/${file}`);
  }
}

if (import.meta.url === pathToFileURL(argv[1]).href) {
  copyAssets();
}
