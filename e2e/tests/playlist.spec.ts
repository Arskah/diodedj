import { test, expect } from "../test";
import { clickScan, waitForPlaylistCount, waitForTrackCount } from "../helpers";

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
    await expect(win.locator(".pl-tab").first()).toContainText("(3)");

    await win
      .locator("#playlist .playlist-row")
      .nth(1)
      .locator(".btn-remove")
      .click();
    await expect(win.locator("#playlist .playlist-row")).toHaveCount(2);
    await expect(win.locator(".pl-tab").first()).toContainText("(2)");

    await win.click("#btn-clear-playlist");
    await expect(win.locator("#playlist .empty")).toContainText(
      "Playlist empty",
    );
    await expect(win.locator(".pl-tab").first()).toContainText("(0)");
  });

  test("history tab lists played tracks newest-first; dblclick re-queues; clear scoped to active tab", async ({
    launch,
    library,
  }) => {
    const fx = await library({
      music: [
        { name: "hist-a", durationSec: 30 },
        { name: "hist-b", durationSec: 30 },
        { name: "hist-c", durationSec: 30 },
      ],
    });
    const { win } = await launch({ musicPaths: [fx.musicDir] });

    await clickScan(win);
    await waitForTrackCount(win, 3);
    await win.evaluate(() => {
      (document.getElementById("audio") as HTMLAudioElement).muted = true;
    });

    const trackRows = win.locator("#track-list .track-row");
    await trackRows.nth(0).dblclick();
    await trackRows.nth(1).dblclick();
    await trackRows.nth(2).dblclick();
    await waitForPlaylistCount(win, 3);

    await win.locator("#playlist .playlist-row").first().dblclick();
    await expect(win.locator("#np-title")).toHaveText("hist-a");
    await win.click("#btn-next");
    await expect(win.locator("#np-title")).toHaveText("hist-b");
    await win.click("#btn-next");
    await expect(win.locator("#np-title")).toHaveText("hist-c");

    const historyTab = win.locator(".pl-tab").nth(1);
    await expect(historyTab).toContainText("(2)");
    await historyTab.click();

    const historyRows = win.locator("#history .playlist-row");
    await expect(historyRows).toHaveCount(2);
    await expect(historyRows.nth(0)).toContainText("hist-b");
    await expect(historyRows.nth(1)).toContainText("hist-a");

    await historyRows.nth(0).dblclick();
    await win.locator(".pl-tab").first().click();
    await expect(win.locator("#playlist .playlist-row")).toHaveCount(1);
    await expect(win.locator("#playlist .playlist-row")).toContainText(
      "hist-b",
    );

    await win.locator(".pl-tab").nth(1).click();
    await win.click("#btn-clear-playlist");
    await expect(win.locator("#history .empty")).toContainText("History empty");
    await expect(win.locator("#np-title")).toHaveText("hist-c");
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
