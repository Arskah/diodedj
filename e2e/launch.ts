import { browser } from "@wdio/globals";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { APP_BINARY } from "./wdio.conf";

export interface SeededConfig {
  musicPaths?: string[];
  commercialPaths?: string[];
  jinglePaths?: string[];
}

export interface LaunchedApp {
  xdgDataHome: string;
  appDataDir: string;
  cleanup: () => Promise<void>;
}

const APP_IDENTIFIER = "com.diodedj.app";

export async function launchApp(
  seeded: SeededConfig = {},
): Promise<LaunchedApp> {
  const xdgDataHome = await fs.mkdtemp(path.join(os.tmpdir(), "diodedj-e2e-"));
  const appDataDir = path.join(xdgDataHome, APP_IDENTIFIER);
  await fs.mkdir(appDataDir, { recursive: true });

  const config = {
    musicPaths: seeded.musicPaths ?? [],
    commercialPaths: seeded.commercialPaths ?? [],
    jinglePaths: seeded.jinglePaths ?? [],
  };
  await fs.writeFile(
    path.join(appDataDir, "config.json"),
    JSON.stringify(config, null, 2),
  );

  await browser.reloadSession({
    "tauri:options": {
      application: APP_BINARY,
      env: {
        XDG_DATA_HOME: xdgDataHome,
        RUST_LOG: process.env.RUST_LOG ?? "debug",
        RUST_BACKTRACE: "1",
      },
    },
  } as unknown as WebdriverIO.Capabilities);

  await browser.$("#track-list").waitForExist({ timeout: 15_000 });

  const cleanup = async (): Promise<void> => {
    await fs.rm(xdgDataHome, { recursive: true, force: true });
  };

  return { xdgDataHome, appDataDir, cleanup };
}

export async function captureArtifacts(specName: string): Promise<void> {
  const resultsDir = path.join(
    process.cwd(),
    "e2e-results",
    sanitize(specName),
  );
  await fs.mkdir(resultsDir, { recursive: true });
  try {
    await browser.saveScreenshot(path.join(resultsDir, "failure.png"));
  } catch {
    /* session may already be gone */
  }
}

function sanitize(s: string): string {
  return s.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 100);
}
