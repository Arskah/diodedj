import { test, expect } from "@playwright/test";
import { createFixtureLibrary } from "./fixtures";
import {
  clickScan,
  launchApp,
  waitForPlaylistCount,
  waitForTrackCount,
} from "./helpers";

test.describe("playlist", () => {
  test("double-click adds, remove button removes, clear empties", async () => {
    const fx = await createFixtureLibrary({
      music: [{ name: "pl-a" }, { name: "pl-b" }, { name: "pl-c" }],
    });
    const { win, cleanup } = await launchApp({ musicPaths: [fx.musicDir] });
    try {
      await clickScan(win);
      await waitForTrackCount(win, 3);

      // Double-click each library row to enqueue
      const rows = win.locator("#track-list .track-row");
      await rows.nth(0).dblclick();
      await rows.nth(1).dblclick();
      await rows.nth(2).dblclick();
      await waitForPlaylistCount(win, 3);
      await expect(win.locator("#playlist-count")).toHaveText("(3)");

      // Remove middle row
      await win
        .locator("#playlist .playlist-row")
        .nth(1)
        .locator(".btn-remove")
        .click();
      await expect(win.locator("#playlist .playlist-row")).toHaveCount(2);
      await expect(win.locator("#playlist-count")).toHaveText("(2)");

      // Clear all
      await win.click("#btn-clear-playlist");
      await expect(win.locator("#playlist .empty")).toContainText(
        "Playlist empty",
      );
      await expect(win.locator("#playlist-count")).toHaveText("(0)");
    } finally {
      await cleanup();
      await fx.cleanup();
    }
  });

  test("auto-playlist toggle fills the buffer from the library", async () => {
    // Need enough tracks to fill the 5-track buffer
    const fx = await createFixtureLibrary({
      music: Array.from({ length: 8 }, (_, i) => ({ name: `auto-${i}` })),
    });
    const { win, cleanup } = await launchApp({ musicPaths: [fx.musicDir] });
    try {
      await clickScan(win);
      await waitForTrackCount(win, 8);
      await win.evaluate(() => {
        (document.getElementById("audio") as HTMLAudioElement).muted = true;
      });

      await win.click("#btn-generate");
      await waitForPlaylistCount(win, 5);
      await expect(win.locator("#btn-generate")).toHaveClass(/active/);
      await expect(win.locator("#playlist .playlist-row")).toHaveCount(5);
    } finally {
      await cleanup();
      await fx.cleanup();
    }
  });
});
