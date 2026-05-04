import { describe, expect, it } from "vitest";
import { shouldRescan } from "../../src/main/scanner";
import type { Track } from "../../src/main/db/types";

function makeTrack(partial: Partial<Track>): Track {
  return {
    id: 1,
    path: "/x",
    content_type: "music",
    title: "t",
    artist: "a",
    album: "al",
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
    ...partial,
  };
}

describe("shouldRescan", () => {
  it("returns true when no existing track", () => {
    expect(shouldRescan(undefined, 100, "music")).toBe(true);
  });

  it("returns true when existing has null mtime", () => {
    expect(shouldRescan(makeTrack({ mtime: null }), 100, "music")).toBe(true);
  });

  it("returns true when content_type differs", () => {
    expect(
      shouldRescan(
        makeTrack({ mtime: 100, content_type: "music" }),
        100,
        "jingle",
      ),
    ).toBe(true);
  });

  it("returns true when mtime differs", () => {
    expect(
      shouldRescan(
        makeTrack({ mtime: 100, content_type: "music" }),
        200,
        "music",
      ),
    ).toBe(true);
  });

  it("returns false when mtime + content_type match", () => {
    expect(
      shouldRescan(
        makeTrack({ mtime: 100, content_type: "music" }),
        100,
        "music",
      ),
    ).toBe(false);
  });
});
