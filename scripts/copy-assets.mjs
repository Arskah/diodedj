import { copyFileSync, mkdirSync } from "fs";
import { pathToFileURL } from "url";

export const ASSETS = ["index.html", "styles.css"];

export function copyAssets() {
  mkdirSync("dist/renderer", { recursive: true });
  for (const file of ASSETS) {
    copyFileSync(`src/renderer/${file}`, `dist/renderer/${file}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  copyAssets();
}
