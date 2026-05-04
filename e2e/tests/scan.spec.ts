import { test, expect } from "../test";
import { clickScan, waitForTrackCount } from "../helpers";

test.describe("background scan", () => {
  test("status bar reports completion and auto-hides", async ({
    launch,
    library,
  }) => {
    const fx = await library({
      music: [{ name: "song-one" }, { name: "song-two" }],
    });
    const { win } = await launch({ musicPaths: [fx.musicDir] });

    await clickScan(win);
    await waitForTrackCount(win, 2);

    const bar = win.locator("#scan-status-bar");
    await expect(bar).toContainText(/Scan complete/);
    await expect(bar).toBeHidden({ timeout: 10_000 });
  });

  test("search input stays interactive during scan", async ({
    launch,
    library,
  }) => {
    const fx = await library({
      music: Array.from({ length: 20 }, (_, i) => ({ name: `song-${i}` })),
    });
    const { win } = await launch({ musicPaths: [fx.musicDir] });

    await win.click("#btn-scan");
    await win.fill("#search-input", "song");
    await expect(win.locator("#search-input")).toHaveValue("song");

    await win.waitForFunction(
      () => {
        const bar = document.getElementById("scan-status-bar");
        return !bar || bar.getAttribute("data-state") !== "running";
      },
      null,
      { timeout: 30_000 },
    );
  });
});
