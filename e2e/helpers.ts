import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import fs from "fs/promises";
import os from "os";
import path from "path";

export interface LaunchOptions {
  musicPaths?: string[];
  commercialPaths?: string[];
  jinglePaths?: string[];
}

export interface LaunchedApp {
  app: ElectronApplication;
  win: Page;
  userDataDir: string;
  cleanup: () => Promise<void>;
}

const REPO_ROOT = path.resolve(__dirname, "..");

export async function launchApp(
  opts: LaunchOptions = {},
): Promise<LaunchedApp> {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "diodedj-e2e-"));

  const config = {
    musicPaths: opts.musicPaths ?? [],
    commercialPaths: opts.commercialPaths ?? [],
    jinglePaths: opts.jinglePaths ?? [],
  };
  await fs.writeFile(
    path.join(userDataDir, "config.json"),
    JSON.stringify(config, null, 2),
  );

  const app = await electron.launch({
    args: [REPO_ROOT, `--user-data-dir=${userDataDir}`],
    cwd: REPO_ROOT,
    env: { ...process.env, NODE_ENV: "test" },
  });

  const win = await app.firstWindow();
  await win.waitForLoadState("domcontentloaded");
  // Wait for preload bridge + renderer init
  await win.waitForFunction(
    () =>
      typeof (window as unknown as { api?: unknown }).api !== "undefined" &&
      document.querySelector("#track-list") !== null,
    null,
    { timeout: 15_000 },
  );

  const cleanup = async (): Promise<void> => {
    try {
      await app.close();
    } catch {
      /* already closed */
    }
    await fs.rm(userDataDir, { recursive: true, force: true });
  };

  return { app, win, userDataDir, cleanup };
}

/**
 * Wait for the app to render N tracks in the library list.
 * Used after a scan to ensure renderer caught up.
 */
export async function waitForTrackCount(
  win: Page,
  count: number,
): Promise<void> {
  await win.waitForFunction(
    (n) => document.querySelectorAll("#track-list .track-row").length >= n,
    count,
    { timeout: 15_000 },
  );
}

export async function waitForPlaylistCount(
  win: Page,
  count: number,
): Promise<void> {
  await win.waitForFunction(
    (n) => document.querySelectorAll("#playlist .playlist-row").length >= n,
    count,
    { timeout: 10_000 },
  );
}

export async function clickScan(win: Page): Promise<void> {
  await win.click("#btn-scan");
  // Status bar reflects scan state via data-state. Wait until it leaves "running".
  await win.waitForFunction(
    () => {
      const bar = document.getElementById("scan-status-bar");
      if (!bar) return true;
      return bar.getAttribute("data-state") !== "running";
    },
    null,
    { timeout: 30_000 },
  );
}
