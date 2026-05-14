import { browser, expect } from "@wdio/globals";
import { launchApp, captureArtifacts } from "../launch";
import { createFixtureLibrary, type FixtureLibrary } from "../fixtures";
import { sel } from "../selectors";

describe("playlist", () => {
  let fixtures: FixtureLibrary | null = null;

  afterEach(async function () {
    if (this.currentTest?.state === "failed") {
      await captureArtifacts(this.currentTest.fullTitle());
    }
    if (fixtures) await fixtures.cleanup();
    fixtures = null;
  });

  it("auto-playlist toggle fills queue with lookahead tracks", async () => {
    const music = Array.from({ length: 10 }, (_, i) => ({
      name: `auto-${i}`,
    }));
    fixtures = await createFixtureLibrary({ music });
    await launchApp({ musicPaths: [fixtures.musicDir] });

    await browser.$(sel.settingsButton).click();
    await browser.$(sel.scanButton).waitForClickable({ timeout: 5_000 });
    await browser.$(sel.scanButton).click();
    await browser.waitUntil(
      async () => (await browser.$$(sel.trackRow).length) >= 10,
      { timeout: 15_000 },
    );

    const toggle = browser.$(sel.autoPlaylistToggle);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    await browser.waitUntil(
      async () =>
        (await browser.$$(`${sel.playlist} ${sel.playlistRow}`).length) >= 5,
      {
        timeout: 8_000,
        timeoutMsg: "auto-playlist did not populate lookahead",
      },
    );
  });
});
