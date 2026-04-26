import { app } from "electron";
import fs from "fs";
import path from "path";
import { inspect } from "util";

let stream: fs.WriteStream | null = null;

function format(level: string, args: unknown[]): string {
  const ts = new Date().toISOString();
  const parts = args.map((a) =>
    typeof a === "string" ? a : inspect(a, { depth: 4, breakLength: 120 }),
  );
  return `${ts} [${level}] ${parts.join(" ")}\n`;
}

export function init(): void {
  const dir = app.getPath("logs");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "main.log");
  stream = fs.createWriteStream(file, { flags: "a" });

  const origLog = console.log.bind(console);
  const origErr = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  console.log = (...args: unknown[]) => {
    stream?.write(format("INFO", args));
    origLog(...args);
  };
  console.error = (...args: unknown[]) => {
    stream?.write(format("ERROR", args));
    origErr(...args);
  };
  console.warn = (...args: unknown[]) => {
    stream?.write(format("WARN", args));
    origWarn(...args);
  };

  process.on("uncaughtException", (err) => {
    stream?.write(format("FATAL", ["uncaughtException", err]));
    origErr("uncaughtException", err);
  });
  process.on("unhandledRejection", (reason) => {
    stream?.write(format("FATAL", ["unhandledRejection", reason]));
    origErr("unhandledRejection", reason);
  });

  origLog(`logger: writing to ${file}`);
}

export function close(): void {
  stream?.end();
  stream = null;
}
