import { test, expect } from "@playwright/test";
import { createFixtureLibrary } from "./fixtures";
import { clickScan, launchApp, waitForTrackCount } from "./helpers";

test.describe("library", () => {
  test("paths modal lists pre-seeded folders for each content type", async () => {
    const fx = await createFixtureLibrary({});
    const { win, cleanup } = await launchApp({
      musicPaths: [fx.musicDir],
      commercialPaths: [fx.commercialDir],
      jinglePaths: [fx.jingleDir],
    });
    try {
      await win.click("#btn-paths");
      await expect(win.locator("#paths-overlay")).toBeVisible();
      await expect(win.locator("#paths-list .path-text")).toHaveCount(3);
      await expect(win.locator("#paths-list")).toContainText(fx.musicDir);
      await expect(win.locator("#paths-list")).toContainText(fx.commercialDir);
      await expect(win.locator("#paths-list")).toContainText(fx.jingleDir);

      await win.click("#btn-close-paths");
      await expect(win.locator("#paths-overlay")).toBeHidden();
    } finally {
      await cleanup();
      await fx.cleanup();
    }
  });

  test("removing a path from the modal updates config", async () => {
    const fx = await createFixtureLibrary({});
    const { win, cleanup } = await launchApp({
      musicPaths: [fx.musicDir],
    });
    try {
      await win.click("#btn-paths");
      await expect(win.locator("#paths-list .path-text")).toHaveCount(1);
      await win.locator("#paths-list .path-row .btn-remove").first().click();
      await expect(win.locator("#paths-list .path-text")).toHaveCount(0);
      await expect(win.locator("#paths-list")).toContainText(
        "No folders configured",
      );
    } finally {
      await cleanup();
      await fx.cleanup();
    }
  });

  test("scan ingests audio files and exposes them via search + stats", async () => {
    const fx = await createFixtureLibrary({
      music: [
        { name: "alpha-track" },
        { name: "beta-song" },
        { name: "gamma-tune" },
      ],
    });
    const { win, cleanup } = await launchApp({
      musicPaths: [fx.musicDir],
    });
    try {
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
    } finally {
      await cleanup();
      await fx.cleanup();
    }
  });

  test("content-type tabs filter the library list", async () => {
    const fx = await createFixtureLibrary({
      music: [{ name: "music-one" }],
      commercial: [{ name: "ad-one" }, { name: "ad-two" }],
      jingle: [{ name: "stinger" }],
    });
    const { win, cleanup } = await launchApp({
      musicPaths: [fx.musicDir],
      commercialPaths: [fx.commercialDir],
      jinglePaths: [fx.jingleDir],
    });
    try {
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
    } finally {
      await cleanup();
      await fx.cleanup();
    }
  });

  test("scan after removing a path prunes orphaned tracks", async () => {
    const fx = await createFixtureLibrary({
      music: [{ name: "keeper" }, { name: "doomed" }],
    });
    // Two separate dirs so we can drop one
    const fx2 = await createFixtureLibrary({
      music: [{ name: "extra" }],
    });
    const { win, cleanup } = await launchApp({
      musicPaths: [fx.musicDir, fx2.musicDir],
    });
    try {
      await clickScan(win);
      await waitForTrackCount(win, 3);
      await expect(win.locator("#track-list .track-row")).toHaveCount(3);

      // Remove fx2 path via paths modal
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
    } finally {
      await cleanup();
      await fx.cleanup();
      await fx2.cleanup();
    }
  });
});
