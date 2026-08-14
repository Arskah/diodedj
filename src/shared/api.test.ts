import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import { api } from "./api";

beforeEach(() => {
  vi.clearAllMocks();
  invoke.mockResolvedValue({});
});

describe("api.updateTrackMetadata", () => {
  it("omits empty title/artist/album (non-nullable: leave unchanged)", async () => {
    await api.updateTrackMetadata({
      id: 1,
      title: "",
      artist: "",
      album: "",
      genre: "Rock",
      year: 2020,
    });
    const [cmd, payload] = invoke.mock.calls[0];
    expect(cmd).toBe("update_track_metadata");
    expect(payload).toEqual({
      updates: { id: 1, genre: "Rock", year: 2020 },
    });
  });

  it("sends genre/year null through so the backend clears them", async () => {
    // Regression: the wrapper previously dropped `null`, so the advertised
    // "clear a field" feature silently no-oped. A present `null` must reach the
    // backend to distinguish "clear" from "omit".
    await api.updateTrackMetadata({
      id: 7,
      title: "Keep",
      artist: "Keep",
      album: "Keep",
      genre: null,
      year: null,
    });
    const [, payload] = invoke.mock.calls[0];
    expect(payload).toEqual({
      updates: {
        id: 7,
        title: "Keep",
        artist: "Keep",
        album: "Keep",
        genre: null,
        year: null,
      },
    });
    // Explicit: the null keys are present, not omitted.
    expect(Object.prototype.hasOwnProperty.call(payload.updates, "genre")).toBe(
      true,
    );
    expect(payload.updates.genre).toBeNull();
    expect(payload.updates.year).toBeNull();
  });

  it("forwards concrete title/genre/year values", async () => {
    await api.updateTrackMetadata({
      id: 3,
      title: "New Title",
      artist: "New Artist",
      album: "New Album",
      genre: "Jazz",
      year: 1999,
    });
    const [, payload] = invoke.mock.calls[0];
    expect(payload.updates).toEqual({
      id: 3,
      title: "New Title",
      artist: "New Artist",
      album: "New Album",
      genre: "Jazz",
      year: 1999,
    });
  });
});
