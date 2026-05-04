import type { PlayerBackend, PlayerEvent, PlayerEventHandler } from "./backend";

export class HtmlAudioBackend implements PlayerBackend {
  private audio: HTMLAudioElement;
  private handlers = new Set<PlayerEventHandler>();

  constructor() {
    this.audio = new Audio();
    this.audio.addEventListener("play", () => {
      this.emit({ type: "pause-state", paused: false });
    });
    this.audio.addEventListener("pause", () => {
      this.emit({ type: "pause-state", paused: true });
    });
    this.audio.addEventListener("timeupdate", () => {
      this.emit({ type: "time", seconds: this.audio.currentTime });
      const d = this.audio.duration;
      if (isFinite(d) && d > 0) {
        this.emit({ type: "duration", seconds: d });
      }
    });
    this.audio.addEventListener("durationchange", () => {
      const d = this.audio.duration;
      if (isFinite(d) && d > 0) {
        this.emit({ type: "duration", seconds: d });
      }
    });
    this.audio.addEventListener("ended", () => {
      this.emit({ type: "ended" });
    });
    this.audio.addEventListener("error", () => {
      const err = this.audio.error;
      this.emit({
        type: "error",
        message: err?.message ?? `code ${err?.code ?? "unknown"}`,
      });
    });
  }

  load(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const onLoaded = (): void => {
        cleanup();
        resolve();
      };
      const onError = (): void => {
        cleanup();
        reject(new Error(this.audio.error?.message ?? "audio element error"));
      };
      const cleanup = (): void => {
        this.audio.removeEventListener("loadedmetadata", onLoaded);
        this.audio.removeEventListener("error", onError);
      };
      this.audio.addEventListener("loadedmetadata", onLoaded);
      this.audio.addEventListener("error", onError);
      this.audio.src = url;
      this.audio.load();
    });
  }

  async play(): Promise<void> {
    await this.audio.play();
  }

  async pause(): Promise<void> {
    this.audio.pause();
  }

  async stop(): Promise<void> {
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
  }

  async seek(seconds: number): Promise<void> {
    this.audio.currentTime = seconds;
  }

  async setVolume(volume: number): Promise<void> {
    this.audio.volume = volume;
  }

  on(handler: PlayerEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async dispose(): Promise<void> {
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.handlers.clear();
  }

  private emit(event: PlayerEvent): void {
    for (const h of this.handlers) h(event);
  }
}
