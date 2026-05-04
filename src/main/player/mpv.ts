import { ChildProcess } from "child_process";
import { logger } from "../logger";
import { MpvTransport, generateSocketPath, spawnMpv } from "./transport";

export { type MpvTransport } from "./transport";

export type MpvEvent =
  | { type: "time"; seconds: number }
  | { type: "duration"; seconds: number }
  | { type: "pause-state"; paused: boolean }
  | { type: "ended" }
  | { type: "error"; message: string };

export type MpvEventHandler = (event: MpvEvent) => void;

export interface MpvOptions {
  binary: string;
  device?: string | null;
  exclusive?: boolean;
  replayGain?: "no" | "track" | "album";
  msgLevel?: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

const PROP_TIME = 1;
const PROP_DURATION = 2;
const PROP_PAUSE = 3;

const TIME_THROTTLE_MS = 100;

export class Mpv {
  private proc: ChildProcess | null = null;
  private transport: MpvTransport | null = null;
  private requestId = 0;
  private pending = new Map<number, PendingRequest>();
  private handlers = new Set<MpvEventHandler>();
  private lastTimeEmit = 0;
  private disposing = false;

  constructor(private options: MpvOptions) {}

  async start(): Promise<void> {
    const args = this.buildArgs();
    const socketPath = generateSocketPath();
    const spawned = await spawnMpv(this.options.binary, args, socketPath);
    this.proc = spawned.proc;
    this.proc.on("exit", (code, signal) => {
      logger.info(`mpv exited code=${code} signal=${signal}`);
    });
    await this.attach(spawned.transport);
  }

  // Wires the state machine to a transport. Public for tests so the
  // command/event protocol can be exercised against a fake transport
  // without spawning a real mpv subprocess.
  async attach(transport: MpvTransport): Promise<void> {
    this.transport = transport;
    transport.onLine((line) => this.onLine(line));
    transport.onClose(() => {
      if (!this.disposing) {
        logger.warn("mpv transport closed unexpectedly");
        this.emit({ type: "error", message: "mpv transport closed" });
      }
    });
    await this.observe(PROP_TIME, "time-pos");
    await this.observe(PROP_DURATION, "duration");
    await this.observe(PROP_PAUSE, "pause");
  }

  on(handler: MpvEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async load(filePath: string): Promise<void> {
    await this.command(["loadfile", filePath, "replace"]);
  }

  async play(): Promise<void> {
    await this.command(["set_property", "pause", false]);
  }

  async pause(): Promise<void> {
    await this.command(["set_property", "pause", true]);
  }

  async stop(): Promise<void> {
    await this.command(["stop"]);
  }

  async seek(seconds: number): Promise<void> {
    await this.command(["seek", seconds, "absolute"]);
  }

  async setVolume(volume: number): Promise<void> {
    const clamped = Math.min(1, Math.max(0, volume));
    await this.command(["set_property", "volume", clamped * 100]);
  }

  async setDevice(device: string | null): Promise<void> {
    await this.command(["set_property", "audio-device", device ?? "auto"]);
  }

  async dispose(): Promise<void> {
    if (this.disposing) return;
    this.disposing = true;
    try {
      if (this.transport) {
        this.transport.write(JSON.stringify({ command: ["quit"] }));
      }
    } catch {
      // socket may be dead already
    }
    const exited = new Promise<void>((resolve) => {
      if (!this.proc) return resolve();
      this.proc.once("exit", () => resolve());
    });
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 500));
    await Promise.race([exited, timeout]);
    if (this.proc && this.proc.exitCode === null) {
      this.proc.kill("SIGKILL");
    }
    if (this.transport) {
      await this.transport.close();
    }
    this.handlers.clear();
    this.pending.clear();
  }

  private buildArgs(): string[] {
    const args = [
      "--idle=yes",
      "--no-video",
      "--no-terminal",
      "--no-input-default-bindings",
      "--no-osc",
      "--gapless-audio=yes",
      "--prefetch-playlist=yes",
      "--keep-open=no",
      `--msg-level=${this.options.msgLevel ?? "all=warn"}`,
      "--volume=100",
    ];
    if (this.options.replayGain) {
      args.push(`--replaygain=${this.options.replayGain}`);
    } else {
      args.push("--replaygain=track");
    }
    if (this.options.device) {
      args.push(`--audio-device=${this.options.device}`);
    }
    if (this.options.exclusive) {
      args.push("--audio-exclusive=yes");
    }
    return args;
  }

  private observe(id: number, name: string): Promise<unknown> {
    return this.command(["observe_property", id, name]);
  }

  private command(args: unknown[]): Promise<unknown> {
    if (!this.transport) {
      return Promise.reject(new Error("mpv transport not started"));
    }
    const transport = this.transport;
    const requestId = ++this.requestId;
    const payload = JSON.stringify({ command: args, request_id: requestId });
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      try {
        transport.write(payload);
      } catch (err) {
        this.pending.delete(requestId);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private onLine(line: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch (err) {
      logger.warn(`mpv: malformed JSON: ${line}`, err);
      return;
    }

    if (typeof msg.request_id === "number") {
      const reqId = msg.request_id;
      const pending = this.pending.get(reqId);
      if (pending) {
        this.pending.delete(reqId);
        if (msg.error === "success") {
          pending.resolve(msg.data);
        } else {
          pending.reject(new Error(`mpv: ${String(msg.error)}`));
        }
      }
      return;
    }

    if (typeof msg.event === "string") {
      this.onEvent(msg);
    }
  }

  private onEvent(msg: Record<string, unknown>): void {
    const event = msg.event as string;
    switch (event) {
      case "property-change":
        this.onPropertyChange(msg);
        break;
      case "end-file":
        if (msg.reason === "eof") {
          this.emit({ type: "ended" });
        } else if (msg.reason === "error") {
          const errStr =
            typeof msg.file_error === "string" ? msg.file_error : "load error";
          this.emit({ type: "error", message: errStr });
        }
        break;
    }
  }

  private onPropertyChange(msg: Record<string, unknown>): void {
    const id = msg.id as number;
    const data = msg.data;
    switch (id) {
      case PROP_TIME: {
        if (typeof data !== "number") return;
        const now = Date.now();
        if (now - this.lastTimeEmit < TIME_THROTTLE_MS) return;
        this.lastTimeEmit = now;
        this.emit({ type: "time", seconds: data });
        break;
      }
      case PROP_DURATION:
        if (typeof data === "number" && isFinite(data) && data > 0) {
          this.emit({ type: "duration", seconds: data });
        }
        break;
      case PROP_PAUSE:
        if (typeof data === "boolean") {
          this.emit({ type: "pause-state", paused: data });
        }
        break;
    }
  }

  private emit(event: MpvEvent): void {
    for (const h of this.handlers) h(event);
  }
}
