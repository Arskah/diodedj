import { test, expect } from "../test";
import { clickScan, waitForTrackCount } from "../helpers";

test.describe("library", () => {
  test("paths modal lists pre-seeded folders for each content type", async ({
    launch,
    library,
  }) => {
    const fx = await library({});
    const { win } = await launch({
      musicPaths: [fx.musicDir],
      commercialPaths: [fx.commercialDir],
      jinglePaths: [fx.jingleDir],
    });

    await win.click("#btn-paths");
    await expect(win.locator("#paths-overlay")).toBeVisible();
    await expect(win.locator("#paths-list .path-text")).toHaveCount(3);
    await expect(win.locator("#paths-list")).toContainText(fx.musicDir);
    await expect(win.locator("#paths-list")).toContainText(fx.commercialDir);
    await expect(win.locator("#paths-list")).toContainText(fx.jingleDir);

    await win.click("#btn-close-paths");
    await expect(win.locator("#paths-overlay")).toBeHidden();
  });

  test("removing a path from the modal updates config", async ({
    launch,
    library,
  }) => {
    const fx = await library({});
    const { win } = await launch({ musicPaths: [fx.musicDir] });

    await win.click("#btn-paths");
    await expect(win.locator("#paths-list .path-text")).toHaveCount(1);
    await win.locator("#paths-list .path-row .btn-remove").first().click();
    await expect(win.locator("#paths-list .path-text")).toHaveCount(0);
    await expect(win.locator("#paths-list")).toContainText(
      "No folders configured",
    );
  });

  test("scan ingests audio files and exposes them via search + stats", async ({
    launch,
    library,
  }) => {
    const fx = await library({
      music: [
        { name: "alpha-track" },
        { name: "beta-song" },
        { name: "gamma-tune" },
      ],
    });
    const { win } = await launch({ musicPaths: [fx.musicDir] });

    await clickScan(win);
    await waitForTrackCount(win, 3);
    await expect(win.locator("#track-list .track-row")).toHaveCount(3);
    await expect(win.locator("#library-stats")).toContainText("3 tracks");

    await win.fill("#search-input", "alpha");
    await expect(win.locator("#track-list .track-row")).toHaveCount(1);
    await expect(win.locator("#track-list .track-row").first()).toContainText(
      "alpha-track",
    );

    await win.fill("#search-input", "");
    await expect(win.locator("#track-list .track-row")).toHaveCount(3);
  });

  test("content-type tabs filter the library list", async ({
    launch,
    library,
  }) => {
    const fx = await library({
      music: [{ name: "music-one" }],
      commercial: [{ name: "ad-one" }, { name: "ad-two" }],
      jingle: [{ name: "stinger" }],
    });
    const { win } = await launch({
      musicPaths: [fx.musicDir],
      commercialPaths: [fx.commercialDir],
      jinglePaths: [fx.jingleDir],
    });

    await clickScan(win);
    await waitForTrackCount(win, 1);
    await expect(win.locator("#track-list .track-row")).toHaveCount(1);
    await expect(win.locator("#track-list")).toContainText("music-one");

    await win.click('.lib-tab[data-type="commercial"]');
    await expect(win.locator("#track-list .track-row")).toHaveCount(2);
    await expect(win.locator("#track-list")).toContainText("ad-one");
    await expect(win.locator("#track-list")).toContainText("ad-two");

    await win.click('.lib-tab[data-type="jingle"]');
    await expect(win.locator("#track-list .track-row")).toHaveCount(1);
    await expect(win.locator("#track-list")).toContainText("stinger");
  });

  test("sort by title cycles asc → desc and reorders the list", async ({
    launch,
    library,
  }) => {
    const fx = await library({
      music: [{ name: "charlie" }, { name: "alpha" }, { name: "bravo" }],
    });
    const { win } = await launch({ musicPaths: [fx.musicDir] });

    await clickScan(win);
    await waitForTrackCount(win, 3);

    const titleHeader = win.locator("#track-headers .track-header.track-title");

    await titleHeader.click();
    await expect(titleHeader).toHaveClass(/active/);
    await expect(titleHeader).toContainText("\u25B2");
    await expect
      .poll(() => win.locator("#track-list .track-title").allTextContents())
      .toEqual(["alpha", "bravo", "charlie"]);

    await titleHeader.click();
    await expect(titleHeader).toContainText("\u25BC");
    await expect
      .poll(() => win.locator("#track-list .track-title").allTextContents())
      .toEqual(["charlie", "bravo", "alpha"]);
  });

  test("switching sort column resets direction to ascending", async ({
    launch,
    library,
  }) => {
    const fx = await library({
      music: [{ name: "zeta" }, { name: "kilo" }, { name: "alpha" }],
    });
    const { win } = await launch({ musicPaths: [fx.musicDir] });

    await clickScan(win);
    await waitForTrackCount(win, 3);

    const titleHeader = win.locator("#track-headers .track-header.track-title");
    const playsHeader = win.locator("#track-headers .track-header.track-plays");

    await titleHeader.click();
    await titleHeader.click();
    await expect(titleHeader).toContainText("\u25BC");

    await playsHeader.click();
    await expect(playsHeader).toHaveClass(/active/);
    await expect(playsHeader).toContainText("\u25B2");
    await expect(titleHeader).not.toHaveClass(/active/);
  });

  test("scan after removing a path prunes orphaned tracks", async ({
    launch,
    library,
  }) => {
    const fx = await library({
      music: [{ name: "keeper" }, { name: "doomed" }],
    });
    const fx2 = await library({
      music: [{ name: "extra" }],
    });
    const { win } = await launch({
      musicPaths: [fx.musicDir, fx2.musicDir],
    });

    await clickScan(win);
    await waitForTrackCount(win, 3);
    await expect(win.locator("#track-list .track-row")).toHaveCount(3);

    await win.click("#btn-paths");
    const targetRow = win
      .locator("#paths-list .path-row")
      .filter({ hasText: fx2.musicDir });
    await targetRow.locator(".btn-remove").click();
    await win.click("#btn-close-paths");

    await clickScan(win);
    await win.waitForFunction(
      () => document.querySelectorAll("#track-list .track-row").length === 2,
      null,
      { timeout: 15_000 },
    );
    await expect(win.locator("#track-list")).not.toContainText("extra");
  });
});
