import { test, expect } from "./test";

test.describe("smoke", () => {
  test("launches with empty library and renders shell", async ({ launch }) => {
    const { win } = await launch();
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
    expect(await win.title()).toBe("DiodeDJ");
  });
});
