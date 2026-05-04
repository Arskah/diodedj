import type { PlayerBackend, PlayerEventHandler } from "./backend";

// Test-only backend used in Playwright e2e runs (DIODEDJ_E2E_FAKE_PLAYER=1).
// Records calls without producing audio so e2e doesn't need ffmpeg/portaudio
// nor a working audio device on the runner.
export class StubBackend implements PlayerBackend {
  private handlers = new Set<PlayerEventHandler>();

  async load(_trackId: number): Promise<void> {}

  async play(): Promise<void> {
    for (const h of this.handlers) h({ type: "pause-state", paused: false });
  }

  async pause(): Promise<void> {
    for (const h of this.handlers) h({ type: "pause-state", paused: true });
  }

  async stop(): Promise<void> {
    for (const h of this.handlers) h({ type: "pause-state", paused: true });
  }

  async seek(_seconds: number): Promise<void> {}

  async setVolume(_volume: number): Promise<void> {}

  on(handler: PlayerEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async dispose(): Promise<void> {
    this.handlers.clear();
  }
}
