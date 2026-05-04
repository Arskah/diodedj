import { Track } from "./db/types";
import * as db from "./db";
import { ContentType } from "../types";

// 1 jingle per ~JINGLE_EVERY tracks, 1 commercial per ~COMMERCIAL_EVERY tracks.
const JINGLE_EVERY = 4;
const COMMERCIAL_EVERY = 8;

// Manual filler selection: jingles are picked purely at random (small library,
// repetition is fine and expected). Commercials draw from the 5 with the
// lowest play_count to spread plays more evenly while staying random.
const COMMERCIAL_BUCKET_SIZE = 5;

export async function generate(count: number = 20): Promise<Track[]> {
  if (count <= 0) return [];
  const jingleCount = Math.floor(count / JINGLE_EVERY);
  const commercialCount = Math.floor(count / COMMERCIAL_EVERY);
  const musicCount = Math.max(0, count - jingleCount - commercialCount);

  const [music, jingles, commercials] = await Promise.all([
    db.getRandomTracks(musicCount, "music"),
    jingleCount > 0
      ? db.getRandomTracks(jingleCount, "jingle")
      : Promise.resolve<Track[]>([]),
    commercialCount > 0
      ? db.getRandomTracks(commercialCount, "commercial")
      : Promise.resolve<Track[]>([]),
  ]);

  return interleaveEvenly(music, jingles, commercials);
}

// Distributes `jingles` and `commercials` evenly across the music tracks so
// non-music slots are spaced as uniformly as possible. Pure for testing.
export function interleaveEvenly(
  music: Track[],
  jingles: Track[],
  commercials: Track[],
): Track[] {
  const total = music.length + jingles.length + commercials.length;
  if (total === 0) return [];

  const jSlots = pickEvenSlots(total, jingles.length);
  const remaining: number[] = [];
  for (let i = 0; i < total; i++) {
    if (!jSlots.has(i)) remaining.push(i);
  }
  const cIndices = pickEvenSlots(remaining.length, commercials.length);
  const cSlots = new Set<number>();
  cIndices.forEach((idx) => cSlots.add(remaining[idx]));

  const result: Track[] = new Array(total);
  let mi = 0;
  let ji = 0;
  let ci = 0;
  for (let i = 0; i < total; i++) {
    if (jSlots.has(i)) {
      result[i] = jingles[ji++];
    } else if (cSlots.has(i)) {
      result[i] = commercials[ci++];
    } else {
      result[i] = music[mi++];
    }
  }
  return result;
}

// Picks one filler track. Jingles are chosen uniformly at random across the
// whole library. Commercials are drawn uniform-random from the bottom
// COMMERCIAL_BUCKET_SIZE by play_count so heavier-played commercials rotate
// out as their counts grow. Dupes across consecutive calls are intentionally
// allowed.
export async function pickFiller(
  contentType: ContentType,
): Promise<Track | null> {
  if (contentType === "jingle") {
    const [track] = await db.getRandomTracks(1, "jingle");
    return track ?? null;
  }
  if (contentType === "commercial") {
    const bucket = await db.getBottomNByPlayCount(
      "commercial",
      COMMERCIAL_BUCKET_SIZE,
    );
    return pickRandom(bucket);
  }
  return null;
}

// Pure for testing.
export function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function pickEvenSlots(total: number, count: number): Set<number> {
  const slots = new Set<number>();
  if (count <= 0 || total <= 0) return slots;
  const step = total / count;
  for (let i = 0; i < count; i++) {
    slots.add(Math.floor(i * step + step / 2));
  }
  return slots;
}
