import { browser, expect } from "@wdio/globals";
import { launchApp, captureArtifacts } from "../launch";
import { sel } from "../selectors";

describe("smoke", () => {
  afterEach(async function () {
    if (this.currentTest?.state === "failed") {
      await captureArtifacts(this.currentTest.fullTitle());
    }
  });

  it("boots with empty library and settings closed", async () => {
    await launchApp();

    await expect(browser.$(sel.trackList)).toBeExisting();
    await expect(browser.$("#settings-overlay")).toHaveAttribute(
      "class",
      expect.stringContaining("hidden"),
    );
    await expect(browser.$(`${sel.trackList} .empty .empty-title`)).toHaveText(
      "Your Library is Empty",
    );
  });
});
