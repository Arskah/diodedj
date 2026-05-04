import type {
  PlayerBackend,
  PlayerEvent,
  PlayerEventHandler,
} from "../../src/renderer/player/backend";

export class MockBackend implements PlayerBackend {
  loadedTrackIds: number[] = [];
  seekCalls: number[] = [];
  volume = 1;
  playCalls = 0;
  pauseCalls = 0;
  stopCalls = 0;
  disposeCalls = 0;
  loadShouldReject = false;
  playShouldReject = false;
  seekShouldReject = false;

  private handlers = new Set<PlayerEventHandler>();

  async load(trackId: number): Promise<void> {
    this.loadedTrackIds.push(trackId);
    if (this.loadShouldReject) throw new Error("load failed");
  }

  async play(): Promise<void> {
    this.playCalls++;
    if (this.playShouldReject) throw new Error("play failed");
    this.emit({ type: "pause-state", paused: false });
  }

  async pause(): Promise<void> {
    this.pauseCalls++;
    this.emit({ type: "pause-state", paused: true });
  }

  async stop(): Promise<void> {
    this.stopCalls++;
    this.emit({ type: "pause-state", paused: true });
  }

  async seek(seconds: number): Promise<void> {
    this.seekCalls.push(seconds);
    if (this.seekShouldReject) throw new Error("seek failed");
  }

  async setVolume(volume: number): Promise<void> {
    this.volume = volume;
  }

  on(handler: PlayerEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async dispose(): Promise<void> {
    this.disposeCalls++;
    this.handlers.clear();
  }

  emitTime(seconds: number): void {
    this.emit({ type: "time", seconds });
  }

  emitDuration(seconds: number): void {
    this.emit({ type: "duration", seconds });
  }

  emitPauseState(paused: boolean): void {
    this.emit({ type: "pause-state", paused });
  }

  emitEnded(): void {
    this.emit({ type: "ended" });
  }

  emitError(message: string): void {
    this.emit({ type: "error", message });
  }

  get lastLoadedTrackId(): number | undefined {
    return this.loadedTrackIds[this.loadedTrackIds.length - 1];
  }

  get lastSeek(): number | undefined {
    return this.seekCalls[this.seekCalls.length - 1];
  }

  private emit(event: PlayerEvent): void {
    for (const h of this.handlers) h(event);
  }
}
