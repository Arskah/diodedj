import { browser, expect } from "@wdio/globals";
import { launchApp, captureArtifacts } from "../launch";
import { sel } from "../selectors";

describe("smoke", () => {
  let cleanup: (() => Promise<void>) | null = null;

  afterEach(async function () {
    if (this.currentTest?.state === "failed") {
      await captureArtifacts(this.currentTest.fullTitle());
    }
    if (cleanup) await cleanup();
    cleanup = null;
  });

  it("boots with empty library and settings closed", async () => {
    const app = await launchApp();
    cleanup = app.cleanup;

    await expect(browser.$(sel.trackList)).toBeExisting();
    await expect(browser.$("#settings-overlay")).toHaveAttribute(
      "class",
      expect.stringContaining("hidden"),
    );
    await expect(browser.$(`${sel.trackList} .empty`)).toHaveText(
      "No tracks found",
    );
  });
});
