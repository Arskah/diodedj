import { spawn, ChildProcess } from "child_process";
import net from "net";
import os from "os";
import path from "path";
import { logger } from "../logger";

export interface MpvTransport {
  write(line: string): void;
  onLine(handler: (line: string) => void): void;
  onClose(handler: () => void): void;
  close(): Promise<void>;
}

export interface SpawnedMpv {
  proc: ChildProcess;
  transport: MpvTransport;
  socketPath: string;
}

export function generateSocketPath(): string {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\diodedj-mpv-${id}`;
  }
  return path.join(os.tmpdir(), `diodedj-mpv-${id}.sock`);
}

export async function spawnMpv(
  binary: string,
  args: string[],
  socketPath: string,
): Promise<SpawnedMpv> {
  const fullArgs = [...args, `--input-ipc-server=${socketPath}`];
  const proc = spawn(binary, fullArgs, { stdio: ["ignore", "pipe", "pipe"] });

  proc.stdout?.on("data", (chunk: Buffer) => {
    logger.verbose(`[mpv:stdout] ${chunk.toString().trim()}`);
  });
  proc.stderr?.on("data", (chunk: Buffer) => {
    logger.warn(`[mpv:stderr] ${chunk.toString().trim()}`);
  });
  proc.on("error", (err) => {
    logger.error("mpv spawn error", err);
  });

  const socket = await waitForConnection(socketPath);
  const transport = new SocketTransport(socket);
  return { proc, transport, socketPath };
}

async function waitForConnection(
  socketPath: string,
  attempts = 50,
  delayMs = 50,
): Promise<net.Socket> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await connectOnce(socketPath);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(
    `Failed to connect to mpv socket ${socketPath}: ${String(lastErr)}`,
  );
}

function connectOnce(socketPath: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(socketPath);
    const onError = (err: Error): void => {
      sock.removeListener("connect", onConnect);
      reject(err);
    };
    const onConnect = (): void => {
      sock.removeListener("error", onError);
      resolve(sock);
    };
    sock.once("error", onError);
    sock.once("connect", onConnect);
  });
}

class SocketTransport implements MpvTransport {
  private buffer = "";
  private lineHandlers = new Set<(line: string) => void>();
  private closeHandlers = new Set<() => void>();

  constructor(private socket: net.Socket) {
    socket.on("data", (chunk: Buffer) => this.onData(chunk));
    socket.on("close", () => {
      for (const h of this.closeHandlers) h();
    });
    socket.on("error", (err) => {
      logger.warn("mpv socket error", err);
    });
  }

  write(line: string): void {
    this.socket.write(line + "\n");
  }

  onLine(handler: (line: string) => void): void {
    this.lineHandlers.add(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.add(handler);
  }

  async close(): Promise<void> {
    this.socket.end();
    return new Promise((resolve) => {
      this.socket.once("close", () => resolve());
      setTimeout(() => resolve(), 500);
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    let idx;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      if (line.trim()) {
        for (const h of this.lineHandlers) h(line);
      }
    }
  }
}
