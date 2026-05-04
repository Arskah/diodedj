import fs from "fs";
import path from "path";
import { app } from "electron";

export class MpvBinaryNotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MpvBinaryNotFound";
  }
}

const PLATFORM_DIR =
  process.platform === "darwin"
    ? "darwin"
    : process.platform === "win32"
      ? "win32"
      : "linux";

const EXE = process.platform === "win32" ? "mpv.exe" : "mpv";

export function resolveMpvBinary(): string {
  const bundled = bundledPath();
  if (bundled && fs.existsSync(bundled)) return bundled;

  const dev = devPath();
  if (dev && fs.existsSync(dev)) return dev;

  if (process.platform === "linux") {
    return "mpv";
  }

  throw new MpvBinaryNotFound(
    `mpv binary not found. Looked in: ${bundled ?? "n/a"}, ${dev ?? "n/a"}`,
  );
}

function bundledPath(): string | null {
  if (process.platform === "linux") return null;
  try {
    return path.join(process.resourcesPath, "mpv", EXE);
  } catch {
    return null;
  }
}

function devPath(): string | null {
  if (process.platform === "linux") return null;
  try {
    const root = app.getAppPath();
    return path.join(root, "vendor", "mpv", PLATFORM_DIR, EXE);
  } catch {
    return null;
  }
}
