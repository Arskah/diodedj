import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp", getAppPath: () => "/tmp" },
}));

vi.mock("electron-log/main", () => {
  const fn = vi.fn();
  return {
    default: {
      error: fn,
      warn: fn,
      info: fn,
      verbose: fn,
      debug: fn,
      silly: fn,
      transports: {
        file: {
          level: "info",
          maxSize: 0,
          format: "",
          getFile: () => ({ path: "" }),
        },
        console: { level: "info", format: "" },
      },
      initialize: vi.fn(),
    },
  };
});

import { Mpv, MpvEvent } from "../../src/main/player/mpv";
import type { MpvTransport } from "../../src/main/player/mpv";

class FakeTransport implements MpvTransport {
  written: string[] = [];
  private lineHandlers: ((line: string) => void)[] = [];
  private closeHandlers: (() => void)[] = [];
  // When true, every command (request_id present) is auto-acked with success.
  autoAck = true;

  write(line: string): void {
    this.written.push(line);
    if (this.autoAck) {
      const parsed = JSON.parse(line) as { request_id?: number };
      if (typeof parsed.request_id === "number") {
        this.deliver({ request_id: parsed.request_id, error: "success" });
      }
    }
  }

  onLine(handler: (line: string) => void): void {
    this.lineHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  async close(): Promise<void> {
    for (const h of this.closeHandlers) h();
  }

  // Pushes a fake message from mpv into the state machine.
  deliver(msg: object): void {
    const line = JSON.stringify(msg);
    for (const h of this.lineHandlers) h(line);
  }

  triggerClose(): void {
    for (const h of this.closeHandlers) h();
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function newMpv(): { mpv: Mpv; transport: FakeTransport } {
  const mpv = new Mpv({ binary: "mpv" });
  const transport = new FakeTransport();
  return { mpv, transport };
}

describe("Mpv command protocol", () => {
  it("attach observes time-pos, duration, pause", async () => {
    const { mpv, transport } = newMpv();
    await mpv.attach(transport);

    const observed = transport.written
      .map((l) => JSON.parse(l) as { command?: unknown[] })
      .filter(
        (m) => Array.isArray(m.command) && m.command[0] === "observe_property",
      )
      .map((m) => m.command![2]);
    expect(observed).toEqual(["time-pos", "duration", "pause"]);
  });

  it("load issues loadfile replace", async () => {
    const { mpv, transport } = newMpv();
    await mpv.attach(transport);
    transport.written.length = 0;

    await mpv.load("/tmp/x.mp3");
    const cmd = JSON.parse(transport.written[0]).command;
    expect(cmd).toEqual(["loadfile", "/tmp/x.mp3", "replace"]);
  });

  it("play and pause set pause property", async () => {
    const { mpv, transport } = newMpv();
    await mpv.attach(transport);
    transport.written.length = 0;

    await mpv.play();
    expect(JSON.parse(transport.written[0]).command).toEqual([
      "set_property",
      "pause",
      false,
    ]);
    await mpv.pause();
    expect(JSON.parse(transport.written[1]).command).toEqual([
      "set_property",
      "pause",
      true,
    ]);
  });

  it("seek issues absolute seek", async () => {
    const { mpv, transport } = newMpv();
    await mpv.attach(transport);
    transport.written.length = 0;

    await mpv.seek(42);
    expect(JSON.parse(transport.written[0]).command).toEqual([
      "seek",
      42,
      "absolute",
    ]);
  });

  it("setVolume scales 0..1 to 0..100 and clamps", async () => {
    const { mpv, transport } = newMpv();
    await mpv.attach(transport);
    transport.written.length = 0;

    await mpv.setVolume(0.5);
    await mpv.setVolume(1.5);
    await mpv.setVolume(-1);
    expect(JSON.parse(transport.written[0]).command).toEqual([
      "set_property",
      "volume",
      50,
    ]);
    expect(JSON.parse(transport.written[1]).command).toEqual([
      "set_property",
      "volume",
      100,
    ]);
    expect(JSON.parse(transport.written[2]).command).toEqual([
      "set_property",
      "volume",
      0,
    ]);
  });

  it("rejects command when mpv replies with error", async () => {
    const { mpv, transport } = newMpv();
    await mpv.attach(transport);

    transport.autoAck = false;
    const promise = mpv.play();
    const last = JSON.parse(transport.written[transport.written.length - 1]);
    transport.deliver({
      request_id: last.request_id,
      error: "property unavailable",
    });
    await expect(promise).rejects.toThrow(/property unavailable/);
  });
});

describe("Mpv events", () => {
  it("emits time event on time-pos property change (throttled)", async () => {
    const { mpv, transport } = newMpv();
    const events: MpvEvent[] = [];
    mpv.on((e) => events.push(e));
    await mpv.attach(transport);

    transport.deliver({
      event: "property-change",
      id: 1,
      name: "time-pos",
      data: 1.0,
    });
    transport.deliver({
      event: "property-change",
      id: 1,
      name: "time-pos",
      data: 1.05,
    });
    const times = events.filter((e) => e.type === "time");
    expect(times.length).toBe(1);
    expect((times[0] as { seconds: number }).seconds).toBe(1.0);
  });

  it("emits duration on property change", async () => {
    const { mpv, transport } = newMpv();
    const events: MpvEvent[] = [];
    mpv.on((e) => events.push(e));
    await mpv.attach(transport);

    transport.deliver({
      event: "property-change",
      id: 2,
      name: "duration",
      data: 180.5,
    });
    const dur = events.find((e) => e.type === "duration");
    expect(dur).toEqual({ type: "duration", seconds: 180.5 });
  });

  it("emits pause-state on pause property change", async () => {
    const { mpv, transport } = newMpv();
    const events: MpvEvent[] = [];
    mpv.on((e) => events.push(e));
    await mpv.attach(transport);

    transport.deliver({
      event: "property-change",
      id: 3,
      name: "pause",
      data: true,
    });
    expect(events).toContainEqual({ type: "pause-state", paused: true });
  });

  it("emits ended on end-file with reason eof", async () => {
    const { mpv, transport } = newMpv();
    const events: MpvEvent[] = [];
    mpv.on((e) => events.push(e));
    await mpv.attach(transport);

    transport.deliver({ event: "end-file", reason: "eof" });
    expect(events).toContainEqual({ type: "ended" });
  });

  it("does not emit ended when end-file reason is stop", async () => {
    const { mpv, transport } = newMpv();
    const events: MpvEvent[] = [];
    mpv.on((e) => events.push(e));
    await mpv.attach(transport);

    transport.deliver({ event: "end-file", reason: "stop" });
    expect(events.find((e) => e.type === "ended")).toBeUndefined();
  });

  it("emits error on end-file with reason error", async () => {
    const { mpv, transport } = newMpv();
    const events: MpvEvent[] = [];
    mpv.on((e) => events.push(e));
    await mpv.attach(transport);

    transport.deliver({
      event: "end-file",
      reason: "error",
      file_error: "decode failed",
    });
    expect(events).toContainEqual({
      type: "error",
      message: "decode failed",
    });
  });

  it("emits error when transport closes unexpectedly", async () => {
    const { mpv, transport } = newMpv();
    const events: MpvEvent[] = [];
    mpv.on((e) => events.push(e));
    await mpv.attach(transport);

    transport.triggerClose();
    expect(events).toContainEqual({
      type: "error",
      message: "mpv transport closed",
    });
  });
});

describe("Mpv malformed input", () => {
  it("ignores non-JSON lines", async () => {
    const { mpv, transport } = newMpv();
    const events: MpvEvent[] = [];
    mpv.on((e) => events.push(e));
    await mpv.attach(transport);
    const before = events.length;

    for (const h of (
      transport as unknown as { lineHandlers: ((l: string) => void)[] }
    ).lineHandlers) {
      h("not json{");
    }
    await flush();
    expect(events.length).toBe(before);
  });
});
