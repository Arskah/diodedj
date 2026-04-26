import { watch, copyFileSync } from "fs";
import { ASSETS, copyAssets } from "./copy-assets.mjs";

copyAssets();

watch("src/renderer", (event, filename) => {
  if (ASSETS.includes(filename)) {
    copyFileSync(`src/renderer/${filename}`, `dist/renderer/${filename}`);
    console.log(`[assets] copied ${filename}`);
  }
});
