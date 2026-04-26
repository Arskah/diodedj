import { test, expect } from "@playwright/test";
import { launchApp } from "./helpers";

test.describe("smoke", () => {
  test("launches with empty library and renders shell", async () => {
    const { win, cleanup } = await launchApp();
    try {
      await expect(win.locator("#search-input")).toBeVisible();
      await expect(win.locator("#btn-paths")).toBeVisible();
      await expect(win.locator("#btn-scan")).toBeVisible();
      await expect(win.locator("#btn-generate")).toBeVisible();
      await expect(win.locator("#track-list .empty")).toContainText(
        "No tracks found",
      );
      await expect(win.locator("#playlist .empty")).toContainText(
        "Playlist empty",
      );
      await expect(win.locator("#np-title")).toHaveText("No track loaded");
      await expect(win.locator("#time-display")).toHaveText("0:00 / 0:00");
      await expect(win.locator("#btn-mode")).toHaveText("AUTO");
      const title = await win.title();
      expect(title).toBe("DiodeDJ");
    } finally {
      await cleanup();
    }
  });
});
