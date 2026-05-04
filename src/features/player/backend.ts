export type PlayerEvent =
  | { type: "time"; seconds: number }
  | { type: "duration"; seconds: number }
  | { type: "pause-state"; paused: boolean }
  | { type: "ended" }
  | { type: "error"; message: string };

export type PlayerEventHandler = (event: PlayerEvent) => void;

export interface PlayerBackend {
  load(trackId: number): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  on(handler: PlayerEventHandler): () => void;
  dispose(): Promise<void>;
}
