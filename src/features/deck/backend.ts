export type DeckEvent =
  | { type: "time"; seconds: number }
  | { type: "duration"; seconds: number }
  | { type: "pause-state"; paused: boolean }
  | { type: "ended" }
  | { type: "buffering"; buffering: boolean }
  | { type: "error"; message: string };

export type DeckEventHandler = (event: DeckEvent) => void;

export interface DeckBackend {
  load(trackId: number): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  on(handler: DeckEventHandler): () => void;
  dispose(): Promise<void>;
}
