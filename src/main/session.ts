import fs from "fs";
import path from "path";
import { app } from "electron";

export interface SessionState {
  playlistIds: number[];
  historyIds: number[];
  currentTrackId: number | null;
  currentTime: number;
  autoPlaylistActive: boolean;
  autoAdvance: boolean;
  volume: number;
}

const defaults: SessionState = {
  playlistIds: [],
  historyIds: [],
  currentTrackId: null,
  currentTime: 0,
  autoPlaylistActive: false,
  autoAdvance: true,
  volume: 1,
};

let sessionPath: string;

function resolvePath(): string {
  if (!sessionPath) {
    sessionPath = path.join(app.getPath("userData"), "session.json");
  }
  return sessionPath;
}

export function load(): SessionState {
  try {
    const raw = fs.readFileSync(resolvePath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
}

export function save(state: SessionState): void {
  fs.writeFileSync(resolvePath(), JSON.stringify(state, null, 2));
}
