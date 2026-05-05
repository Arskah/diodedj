import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, listen } = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

import { NativeBackend } from "./nativeBackend";
import type { PlayerEvent } from "./backend";

interface ListenCallback {
  (e: { payload: unknown }): void;
}
const listeners: Record<string, ListenCallback> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(listeners)) delete listeners[key];
  listen.mockImplementation((topic: string, cb: ListenCallback) => {
    listeners[topic] = cb;
    return Promise.resolve(() => {
      delete listeners[topic];
    });
  });
  invoke.mockResolvedValue(undefined);
});

describe("NativeBackend (deckId='player' default)", () => {
  it("subscribes to player:* event topics on construction", async () => {
    const b = new NativeBackend();
    await b.load(1); // awaits ready
    const topics = listen.mock.calls.map((c) => c[0]);
    expect(topics).toEqual(
      expect.arrayContaining([
        "player:time",
        "player:duration",
        "player:pause-state",
        "player:ended",
        "player:error",
      ]),
    );
  });

  it("invokes player_* commands", async () => {
    const b = new NativeBackend();
    await b.load(7);
    expect(invoke).toHaveBeenCalledWith("player_load", { id: 7 });
    await b.play();
    expect(invoke).toHaveBeenCalledWith("player_play");
    await b.pause();
    expect(invoke).toHaveBeenCalledWith("player_pause");
    await b.stop();
    expect(invoke).toHaveBeenCalledWith("player_stop");
    await b.seek(3.5);
    expect(invoke).toHaveBeenCalledWith("player_seek", { seconds: 3.5 });
    await b.setVolume(0.7);
    expect(invoke).toHaveBeenCalledWith("player_set_volume", { volume: 0.7 });
  });

  it("forwards player:time events to handlers", async () => {
    const b = new NativeBackend();
    const events: PlayerEvent[] = [];
    b.on((e) => events.push(e));
    await b.load(1); // ensure ready
    listeners["player:time"]({ payload: 12.5 });
    listeners["player:duration"]({ payload: 200 });
    listeners["player:pause-state"]({ payload: true });
    listeners["player:ended"]({ payload: null });
    listeners["player:error"]({ payload: "boom" });
    expect(events).toEqual([
      { type: "time", seconds: 12.5 },
      { type: "duration", seconds: 200 },
      { type: "pause-state", paused: true },
      { type: "ended" },
      { type: "error", message: "boom" },
    ]);
  });
});

describe("NativeBackend (deckId='cue')", () => {
  it("subscribes to cue:* event topics", async () => {
    const b = new NativeBackend("cue");
    await b.load(1);
    const topics = listen.mock.calls.map((c) => c[0]);
    expect(topics).toEqual(
      expect.arrayContaining([
        "cue:time",
        "cue:duration",
        "cue:pause-state",
        "cue:ended",
        "cue:error",
      ]),
    );
  });

  it("invokes cue_* commands", async () => {
    const b = new NativeBackend("cue");
    await b.load(42);
    expect(invoke).toHaveBeenCalledWith("cue_load", { id: 42 });
    await b.play();
    expect(invoke).toHaveBeenCalledWith("cue_play");
    await b.seek(8);
    expect(invoke).toHaveBeenCalledWith("cue_seek", { seconds: 8 });
    await b.setVolume(0.3);
    expect(invoke).toHaveBeenCalledWith("cue_set_volume", { volume: 0.3 });
  });

  it("forwards cue:* events to handlers", async () => {
    const b = new NativeBackend("cue");
    const events: PlayerEvent[] = [];
    b.on((e) => events.push(e));
    await b.load(1);
    listeners["cue:time"]({ payload: 5 });
    expect(events).toEqual([{ type: "time", seconds: 5 }]);
  });

  it("dispose unsubscribes all listeners", async () => {
    const b = new NativeBackend("cue");
    await b.load(1);
    expect(listeners["cue:time"]).toBeDefined();
    await b.dispose();
    expect(listeners["cue:time"]).toBeUndefined();
  });
});
