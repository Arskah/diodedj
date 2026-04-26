import { test, expect } from "./test";
import { clickScan, waitForPlaylistCount, waitForTrackCount } from "./helpers";

test.describe("playlist", () => {
  test("double-click adds, remove button removes, clear empties", async ({
    launch,
    library,
  }) => {
    const fx = await library({
      music: [{ name: "pl-a" }, { name: "pl-b" }, { name: "pl-c" }],
    });
    const { win } = await launch({ musicPaths: [fx.musicDir] });

    await clickScan(win);
    await waitForTrackCount(win, 3);

    const rows = win.locator("#track-list .track-row");
    await rows.nth(0).dblclick();
    await rows.nth(1).dblclick();
    await rows.nth(2).dblclick();
    await waitForPlaylistCount(win, 3);
    await expect(win.locator("#playlist-count")).toHaveText("(3)");

    await win
      .locator("#playlist .playlist-row")
      .nth(1)
      .locator(".btn-remove")
      .click();
    await expect(win.locator("#playlist .playlist-row")).toHaveCount(2);
    await expect(win.locator("#playlist-count")).toHaveText("(2)");

    await win.click("#btn-clear-playlist");
    await expect(win.locator("#playlist .empty")).toContainText(
      "Playlist empty",
    );
    await expect(win.locator("#playlist-count")).toHaveText("(0)");
  });

  test("auto-playlist toggle fills the buffer from the library", async ({
    launch,
    library,
  }) => {
    const fx = await library({
      music: Array.from({ length: 8 }, (_, i) => ({ name: `auto-${i}` })),
    });
    const { win } = await launch({ musicPaths: [fx.musicDir] });

    await clickScan(win);
    await waitForTrackCount(win, 8);
    await win.evaluate(() => {
      (document.getElementById("audio") as HTMLAudioElement).muted = true;
    });

    await win.click("#btn-generate");
    await waitForPlaylistCount(win, 5);
    await expect(win.locator("#btn-generate")).toHaveClass(/active/);
    await expect(win.locator("#playlist .playlist-row")).toHaveCount(5);
  });
});
