import { describe, expect, it, vi } from "vitest";
import { interleaveEvenly, pickRandom } from "../../src/main/playlist";
import type { Track } from "../../src/main/db/types";

type Kind = "m" | "j" | "c";

function track(id: number, kind: Kind): Track {
  const map = { m: "music", j: "jingle", c: "commercial" } as const;
  return {
    id,
    path: `/${id}`,
    content_type: map[kind],
    title: `${kind}${id}`,
    artist: "",
    album: "",
    genre: null,
    year: null,
    duration: 0,
    bpm: null,
    sample_rate: null,
    bitrate: null,
    format: "mp3",
    play_count: 0,
    added_at: "",
    mtime: null,
  };
}

function kindsOf(tracks: Track[]): Kind[] {
  return tracks.map((t) =>
    t.content_type === "music" ? "m" : t.content_type === "jingle" ? "j" : "c",
  );
}

function maxGap(kinds: Kind[], target: Kind): number {
  const positions = kinds
    .map((k, i) => (k === target ? i : -1))
    .filter((i) => i !== -1);
  if (positions.length < 2) return positions.length === 1 ? kinds.length : 0;
  let max = 0;
  for (let i = 1; i < positions.length; i++) {
    max = Math.max(max, positions[i] - positions[i - 1]);
  }
  return max;
}

describe("interleaveEvenly", () => {
  it("returns empty when all pools are empty", () => {
    expect(interleaveEvenly([], [], [])).toEqual([]);
  });

  it("preserves total count and pool contents", () => {
    const music = Array.from({ length: 13 }, (_, i) => track(i, "m"));
    const jingles = Array.from({ length: 5 }, (_, i) => track(100 + i, "j"));
    const commercials = Array.from({ length: 2 }, (_, i) =>
      track(200 + i, "c"),
    );

    const out = interleaveEvenly(music, jingles, commercials);
    expect(out).toHaveLength(20);

    const ids = new Set(out.map((t) => t.id));
    [...music, ...jingles, ...commercials].forEach((t) =>
      expect(ids.has(t.id)).toBe(true),
    );
  });

  it("preserves order within each pool", () => {
    const music = Array.from({ length: 13 }, (_, i) => track(i, "m"));
    const jingles = Array.from({ length: 5 }, (_, i) => track(100 + i, "j"));
    const commercials = Array.from({ length: 2 }, (_, i) =>
      track(200 + i, "c"),
    );

    const out = interleaveEvenly(music, jingles, commercials);
    const ofKind = (k: Kind): number[] =>
      out.filter((t) => kindsOf([t])[0] === k).map((t) => t.id);

    expect(ofKind("m")).toEqual(music.map((t) => t.id));
    expect(ofKind("j")).toEqual(jingles.map((t) => t.id));
    expect(ofKind("c")).toEqual(commercials.map((t) => t.id));
  });

  it("spreads jingles roughly evenly across the playlist", () => {
    const music = Array.from({ length: 15 }, (_, i) => track(i, "m"));
    const jingles = Array.from({ length: 5 }, (_, i) => track(100 + i, "j"));
    const out = interleaveEvenly(music, jingles, []);
    const kinds = kindsOf(out);

    // For 5 jingles in 20 slots, ideal step is 4. Allow some slack.
    expect(maxGap(kinds, "j")).toBeLessThanOrEqual(5);
  });

  it("spreads commercials evenly", () => {
    const music = Array.from({ length: 13 }, (_, i) => track(i, "m"));
    const jingles = Array.from({ length: 5 }, (_, i) => track(100 + i, "j"));
    const commercials = Array.from({ length: 2 }, (_, i) =>
      track(200 + i, "c"),
    );
    const out = interleaveEvenly(music, jingles, commercials);
    const kinds = kindsOf(out);

    // 2 commercials in 20 slots — ideal gap ~10. Allow generous slack.
    expect(maxGap(kinds, "c")).toBeLessThanOrEqual(14);
    expect(maxGap(kinds, "c")).toBeGreaterThanOrEqual(6);
  });

  it("handles only-music input", () => {
    const music = Array.from({ length: 5 }, (_, i) => track(i, "m"));
    const out = interleaveEvenly(music, [], []);
    expect(out.map((t) => t.id)).toEqual([0, 1, 2, 3, 4]);
  });

  it("handles only-jingles input", () => {
    const jingles = Array.from({ length: 3 }, (_, i) => track(i, "j"));
    const out = interleaveEvenly([], jingles, []);
    expect(out.map((t) => t.id)).toEqual([0, 1, 2]);
  });
});

describe("pickRandom", () => {
  it("returns null for empty input", () => {
    expect(pickRandom([])).toBeNull();
  });

  it("returns the only item when input is singleton", () => {
    const items = [track(1, "j")];
    expect(pickRandom(items)).toBe(items[0]);
  });

  it("returns the item at the index produced by Math.random", () => {
    const items = [track(1, "j"), track(2, "j"), track(3, "j")];
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.5); // floor(0.5*3) = 1
    try {
      expect(pickRandom(items)).toBe(items[1]);
    } finally {
      spy.mockRestore();
    }
  });

  it("only returns items from the input bucket", () => {
    const items = [track(1, "j"), track(2, "j"), track(3, "j")];
    for (let i = 0; i < 50; i++) {
      const picked = pickRandom(items);
      expect(items).toContain(picked);
    }
  });
});
