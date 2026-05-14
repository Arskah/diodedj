import { browser, expect } from "@wdio/globals";
import { launchApp, captureArtifacts } from "../launch";
import { createFixtureLibrary, type FixtureLibrary } from "../fixtures";
import { sel } from "../selectors";

describe("library", () => {
  let fixtures: FixtureLibrary | null = null;

  afterEach(async function () {
    if (this.currentTest?.state === "failed") {
      await captureArtifacts(this.currentTest.fullTitle());
    }
    if (fixtures) await fixtures.cleanup();
    fixtures = null;
  });

  async function bootAndScan(): Promise<void> {
    fixtures = await createFixtureLibrary({
      music: [
        { name: "alpha-song" },
        { name: "beta-song" },
        { name: "gamma-track" },
      ],
    });
    await launchApp({ musicPaths: [fixtures.musicDir] });

    await browser.$(sel.settingsButton).click();
    await browser.$(sel.scanButton).waitForClickable({ timeout: 5_000 });
    await browser.$(sel.scanButton).click();

    await browser.waitUntil(
      async () => (await browser.$$(sel.trackRow).length) >= 3,
      { timeout: 15_000, timeoutMsg: "scan did not populate track list" },
    );
  }

  it("scans a fixture library and lists tracks", async () => {
    await bootAndScan();

    const rows = browser.$$(sel.trackRow);
    await expect(rows).toBeElementsArrayOfSize(3);

    const statusBar = browser.$(sel.scanStatusBar);
    if (await statusBar.isExisting()) {
      await expect(statusBar).toHaveText(expect.stringContaining("Scan"));
    }
  });

  it("filters via FTS prefix search", async () => {
    await bootAndScan();

    await browser.$(sel.searchInput).setValue("alpha");
    await browser.waitUntil(
      async () => (await browser.$$(sel.trackRow).length) === 1,
      { timeout: 5_000, timeoutMsg: "search did not filter" },
    );

    const visible = await browser.$$(sel.trackRow);
    await expect(visible[0]).toHaveText(expect.stringContaining("alpha-song"));
  });

  it("re-orders rows when sort header clicked", async () => {
    await bootAndScan();

    const titleHeader = browser.$$('button[role="columnheader"]')[0];
    await titleHeader.click();
    await browser.waitUntil(
      async () => (await titleHeader.getAttribute("aria-sort")) === "ascending",
      { timeout: 5_000 },
    );

    const ascRows = await browser.$$(sel.trackRow);
    const firstAsc = await ascRows[0].$(".track-title").getText();

    await titleHeader.click();
    await browser.waitUntil(
      async () =>
        (await titleHeader.getAttribute("aria-sort")) === "descending",
      { timeout: 5_000 },
    );

    const descRows = await browser.$$(sel.trackRow);
    const firstDesc = await descRows[0].$(".track-title").getText();

    await expect(firstAsc).not.toBe(firstDesc);
  });
});
