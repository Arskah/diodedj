import type { PlayerBackend, PlayerEventHandler } from "./backend";

export class MpvBackend implements PlayerBackend {
  private handlers = new Set<PlayerEventHandler>();
  private subscribed = false;

  constructor() {
    this.subscribe();
  }

  load(trackId: number): Promise<void> {
    return window.api.player.load(trackId);
  }

  play(): Promise<void> {
    return window.api.player.play();
  }

  pause(): Promise<void> {
    return window.api.player.pause();
  }

  stop(): Promise<void> {
    return window.api.player.stop();
  }

  seek(seconds: number): Promise<void> {
    return window.api.player.seek(seconds);
  }

  setVolume(volume: number): Promise<void> {
    return window.api.player.setVolume(volume);
  }

  on(handler: PlayerEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async dispose(): Promise<void> {
    this.handlers.clear();
  }

  private subscribe(): void {
    if (this.subscribed) return;
    this.subscribed = true;
    window.api.player.onEvent((event) => {
      for (const h of this.handlers) h(event);
    });
  }
}
