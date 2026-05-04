import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { PlayerBackend, PlayerEvent, PlayerEventHandler } from "./backend";

export class NativeBackend implements PlayerBackend {
  private handlers = new Set<PlayerEventHandler>();
  private unlisteners: UnlistenFn[] = [];
  private ready: Promise<void>;

  constructor() {
    this.ready = this.subscribe();
  }

  private async subscribe(): Promise<void> {
    const subs = await Promise.all([
      listen<number>("player:time", (e) =>
        this.emit({ type: "time", seconds: e.payload }),
      ),
      listen<number>("player:duration", (e) =>
        this.emit({ type: "duration", seconds: e.payload }),
      ),
      listen<boolean>("player:pause-state", (e) =>
        this.emit({ type: "pause-state", paused: e.payload }),
      ),
      listen<null>("player:ended", () => this.emit({ type: "ended" })),
      listen<string>("player:error", (e) =>
        this.emit({ type: "error", message: e.payload }),
      ),
    ]);
    this.unlisteners.push(...subs);
  }

  async load(trackId: number): Promise<void> {
    await this.ready;
    await invoke<void>("player_load", { id: trackId });
  }

  play(): Promise<void> {
    return invoke<void>("player_play");
  }

  pause(): Promise<void> {
    return invoke<void>("player_pause");
  }

  stop(): Promise<void> {
    return invoke<void>("player_stop");
  }

  seek(seconds: number): Promise<void> {
    return invoke<void>("player_seek", { seconds });
  }

  setVolume(volume: number): Promise<void> {
    return invoke<void>("player_set_volume", { volume });
  }

  on(handler: PlayerEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async dispose(): Promise<void> {
    for (const u of this.unlisteners) u();
    this.unlisteners = [];
    this.handlers.clear();
  }

  private emit(event: PlayerEvent): void {
    for (const h of this.handlers) h(event);
  }
}
