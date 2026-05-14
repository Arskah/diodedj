import { ChildProcess, spawn } from "child_process";
import fs from "fs";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "..");
const E2E_BINARY = process.env.E2E_BINARY ?? "debug";
export const APP_BINARY: string = path.join(
  REPO_ROOT,
  "src-tauri",
  "target",
  E2E_BINARY,
  "diodedj",
);
const RESULTS_DIR = path.join(REPO_ROOT, "e2e-results");

let tauriDriver: ChildProcess | null = null;

export const config: WebdriverIO.Config = {
  runner: "local",
  hostname: "127.0.0.1",
  port: 4444,
  path: "/",
  tsConfigPath: path.join(__dirname, "tsconfig.json"),
  specs: [path.join(__dirname, "specs", "**", "*.spec.ts")],
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      "tauri:options": {
        application: APP_BINARY,
      },
    } as WebdriverIO.Capabilities,
  ],
  logLevel: "info",
  bail: 0,
  waitforTimeout: 10_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 0,
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 90_000,
    retries: 0,
  },

  onPrepare: () => {
    if (!fs.existsSync(APP_BINARY)) {
      throw new Error(
        `e2e binary not found at ${APP_BINARY}\n` +
          `Build first: cargo build --manifest-path src-tauri/Cargo.toml ` +
          `(or E2E_BINARY=release for release build)`,
      );
    }
    fs.rmSync(RESULTS_DIR, { recursive: true, force: true });
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  },

  beforeSession: () => {
    tauriDriver = spawn("tauri-driver", [], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const logPath = path.join(RESULTS_DIR, "tauri-driver.log");
    const logStream = fs.createWriteStream(logPath, { flags: "a" });
    tauriDriver.stdout?.pipe(logStream);
    tauriDriver.stderr?.pipe(logStream);
  },

  afterSession: () => {
    if (tauriDriver) {
      tauriDriver.kill("SIGTERM");
      tauriDriver = null;
    }
  },
};
