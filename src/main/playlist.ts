import { Track } from "./db/types";
import * as db from "./db";

export function generate(count: number = 20): Promise<Track[]> {
  return db.getRandomTracks(count);
}
