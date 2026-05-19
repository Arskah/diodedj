import { ChildProcess, spawn } from "child_process";
import fs from "fs";
import os from "os";
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
const APP_IDENTIFIER = "com.diodedj.app";

// Fixed XDG_DATA_HOME for the whole run. Each test rewrites
// `${XDG_DATA_HOME}/${APP_IDENTIFIER}/config.json` and forces an app respawn via
// `browser.reloadSession()`. The env var is set BEFORE tauri-driver spawns so
// the child app inherits it; tauri-driver does not honour mid-run capability
// changes for `tauri:options.env`.
export const E2E_XDG_DATA_HOME: string = fs.mkdtempSync(
  path.join(os.tmpdir(), "diodedj-e2e-xdg-"),
);
export const E2E_APP_DATA_DIR: string = path.join(
  E2E_XDG_DATA_HOME,
  APP_IDENTIFIER,
);
fs.mkdirSync(E2E_APP_DATA_DIR, { recursive: true });

let tauriDriver: ChildProcess | null = null;

const tailedLogs = new Set<string>();

function tailFile(file: string): void {
  if (tailedLogs.has(file)) return;
  tailedLogs.add(file);
  const prefix = `[app:${path.basename(file)}] `;
  let position = 0;
  let pending = false;
  const stream = () => {
    if (pending) return;
    pending = true;
    fs.stat(file, (err, st) => {
      if (err || st.size <= position) {
        pending = false;
        return;
      }
      const rs = fs.createReadStream(file, { start: position, end: st.size });
      let buf = "";
      rs.on("data", (chunk) => {
        buf += chunk.toString();
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) process.stdout.write(prefix + line + "\n");
      });
      rs.on("end", () => {
        if (buf) process.stdout.write(prefix + buf);
        position = st.size;
        pending = false;
      });
    });
  };
  fs.watchFile(file, { interval: 250 }, stream);
  stream();
}

function tailAppLogs(logsDir: string): void {
  fs.mkdirSync(logsDir, { recursive: true });
  for (const f of fs.readdirSync(logsDir)) {
    if (f.endsWith(".log")) tailFile(path.join(logsDir, f));
  }
  fs.watch(logsDir, (_event, filename) => {
    if (filename && filename.endsWith(".log")) {
      tailFile(path.join(logsDir, filename));
    }
  });
}

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
  outputDir: RESULTS_DIR,
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
    process.env.XDG_DATA_HOME = E2E_XDG_DATA_HOME;
    process.env.RUST_LOG = process.env.RUST_LOG ?? "debug";
    process.env.RUST_BACKTRACE = process.env.RUST_BACKTRACE ?? "1";

    tauriDriver = spawn("tauri-driver", [], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    const logPath = path.join(RESULTS_DIR, "tauri-driver.log");
    const logStream = fs.createWriteStream(logPath, { flags: "a" });
    tauriDriver.stdout?.pipe(logStream);
    tauriDriver.stderr?.pipe(logStream);
    // Also tee to host stdout/stderr so logs surface live in
    // `docker run` output and CI job logs without unzipping artifacts.
    tauriDriver.stdout?.pipe(process.stdout);
    tauriDriver.stderr?.pipe(process.stderr);

    // Tail the app's tauri-plugin-log file sink to stdout. The plugin's
    // Stdout target is swallowed because tauri-driver doesn't forward the
    // app's stdio. The LogDir target writes `${E2E_APP_DATA_DIR}/logs/*.log`,
    // which we follow as soon as it appears.
    tailAppLogs(path.join(E2E_APP_DATA_DIR, "logs"));
  },

  afterSession: () => {
    if (tauriDriver) {
      tauriDriver.kill("SIGTERM");
      tauriDriver = null;
    }
  },
};
