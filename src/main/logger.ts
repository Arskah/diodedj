import type { ChildProcess } from "child_process";
import electronLog from "electron-log/main";
import os from "os";

type LogFn = (...args: unknown[]) => void;

interface Logger {
  error: LogFn;
  warn: LogFn;
  info: LogFn;
  verbose: LogFn;
  debug: LogFn;
  silly: LogFn;
}

type Level = "error" | "warn" | "info" | "verbose" | "debug" | "silly";
const LEVELS: ReadonlySet<Level> = new Set([
  "error",
  "warn",
  "info",
  "verbose",
  "debug",
  "silly",
]);

function resolveLevel(): Level {
  const raw = (process.env.DIODEDJ_LOG_LEVEL ?? "info").toLowerCase();
  return LEVELS.has(raw as Level) ? (raw as Level) : "info";
}

export const logger: Logger = {
  error: (...args) => electronLog.error(...args),
  warn: (...args) => electronLog.warn(...args),
  info: (...args) => electronLog.info(...args),
  verbose: (...args) => electronLog.verbose(...args),
  debug: (...args) => electronLog.debug(...args),
  silly: (...args) => electronLog.silly(...args),
};

export function init(appVersion: string): void {
  const level = resolveLevel();
  electronLog.transports.file.level = level;
  electronLog.transports.console.level = level;
  electronLog.transports.file.maxSize = 12 * 1024 * 1024;
  electronLog.transports.file.format =
    "{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] [{processType}] {text}";
  electronLog.transports.console.format =
    "{h}:{i}:{s}.{ms} [{level}] [{processType}] {text}";

  electronLog.initialize({ spyRendererConsole: true });

  logger.info(
    `app start version=${appVersion} platform=${process.platform} ` +
      `arch=${process.arch} electron=${process.versions.electron} ` +
      `node=${process.versions.node} os=${os.release()} level=${level}`,
  );
  logger.info(
    `logger: writing to ${electronLog.transports.file.getFile().path}`,
  );

  process.on("uncaughtException", (err) => {
    logger.error("uncaughtException", err);
  });
  process.on("unhandledRejection", (reason) => {
    logger.error("unhandledRejection", reason);
  });
}

export function close(): void {
  // electron-log flushes synchronously per write; nothing to close.
}

// Buffers stderr per child process and emits a single logger.warn on
// non-zero exit. Drops on success to keep rotation budget for failures.
export function bufferProcessStderr(proc: ChildProcess, context: string): void {
  const chunks: Buffer[] = [];
  proc.stderr?.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });
  proc.on("error", (err) => {
    logger.error(`${context}: spawn error`, err);
  });
  proc.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      const stderr = Buffer.concat(chunks).toString("utf8").trim();
      logger.warn(
        `${context}: exit code=${code} signal=${signal}` +
          (stderr ? `\n${stderr}` : ""),
      );
    }
    chunks.length = 0;
  });
}
