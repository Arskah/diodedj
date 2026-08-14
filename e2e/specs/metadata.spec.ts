import { browser, expect } from "@wdio/globals";
import { launchApp, captureArtifacts } from "../launch";
import { createFixtureLibrary, type FixtureLibrary } from "../fixtures";
import { sel } from "../selectors";

describe("metadata editing", () => {
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
      music: [{ name: "edit-fixture" }],
    });
    await launchApp({ musicPaths: [fixtures.musicDir] });

    await browser.$(sel.settingsButton).click();
    await browser.$(sel.scanButton).waitForClickable({ timeout: 5_000 });
    await browser.$(sel.scanButton).click();
    await browser.waitUntil(
      async () => (await browser.$$(sel.trackRow).length) >= 1,
      { timeout: 15_000, timeoutMsg: "scan did not populate track list" },
    );
  }

  // Read text/values via the DOM directly — under WebKitGTK getText()/getValue()
  // occasionally return "" for an element Svelte has bound but not yet laid out.
  async function rowTitles(): Promise<string[]> {
    return browser.execute(() =>
      Array.from(document.querySelectorAll(".track-row .track-title")).map(
        (el) => (el.textContent ?? "").trim(),
      ),
    );
  }

  async function inputValue(selector: string): Promise<string> {
    return browser.execute((s) => {
      const el = document.querySelector(s) as HTMLInputElement | null;
      return el?.value ?? "";
    }, selector);
  }

  async function openEditor(): Promise<void> {
    await browser.$(sel.editButton).click();
    await browser.$(sel.editorDialog).waitForExist({ timeout: 5_000 });
    // The overlay animates in; wait until the title field is interactable.
    await browser.$(sel.editorTitle).waitForClickable({ timeout: 5_000 });
  }

  it("edits title/genre/year and persists after reopening", async () => {
    await bootAndScan();

    await openEditor();
    // Untagged WAV → title defaults to the file basename, genre/year empty.
    await expect(await inputValue(sel.editorTitle)).toBe("edit-fixture");

    await browser.$(sel.editorTitle).setValue("Edited Title");
    await browser.$(sel.editorGenre).setValue("Techno");
    await browser.$(sel.editorYear).setValue("1998");
    await browser.$(sel.editorSave).click();

    // Save closes the dialog and the row reflects the new title.
    await browser.$(sel.editorDialog).waitForExist({
      reverse: true,
      timeout: 5_000,
    });
    await browser.waitUntil(
      async () => {
        const titles = await rowTitles();
        return titles.length === 1 && titles[0] === "Edited Title";
      },
      { timeout: 5_000, timeoutMsg: "row title did not update after save" },
    );

    // Reopen — the values come back from the backend (get_track after UPDATE),
    // so seeing them proves the edit round-tripped through the DB, not just the
    // local row patch. Genre/year aren't shown in the row, so this is the only
    // check that covers them.
    await openEditor();
    await expect(await inputValue(sel.editorTitle)).toBe("Edited Title");
    await expect(await inputValue(sel.editorGenre)).toBe("Techno");
    await expect(await inputValue(sel.editorYear)).toBe("1998");
    await browser.$(sel.editorCancel).click();
    await browser.$(sel.editorDialog).waitForExist({
      reverse: true,
      timeout: 5_000,
    });
  });

  it("clears the genre when emptied and saved", async () => {
    await bootAndScan();

    // Seed a genre first.
    await openEditor();
    await browser.$(sel.editorGenre).setValue("Ambient");
    await browser.$(sel.editorSave).click();
    await browser.$(sel.editorDialog).waitForExist({
      reverse: true,
      timeout: 5_000,
    });

    // Reopen, clear it, save.
    await openEditor();
    await expect(await inputValue(sel.editorGenre)).toBe("Ambient");
    await browser.$(sel.editorGenre).clearValue();
    await browser.$(sel.editorSave).click();
    await browser.$(sel.editorDialog).waitForExist({
      reverse: true,
      timeout: 5_000,
    });

    // Reopen — genre is now empty (cleared to NULL and reloaded as "").
    await openEditor();
    await expect(await inputValue(sel.editorGenre)).toBe("");
    await browser.$(sel.editorCancel).click();
  });

  it("rejects an empty title and keeps the dialog open", async () => {
    await bootAndScan();

    await openEditor();
    await browser.$(sel.editorTitle).clearValue();
    await browser.$(sel.editorSave).click();

    // Validation blocks the save: the dialog stays open and an error shows.
    await browser.$(sel.editorError).waitForExist({ timeout: 5_000 });
    await expect(browser.$(sel.editorError)).toHaveText(
      expect.stringContaining("Title"),
    );
    await expect(browser.$(sel.editorDialog)).toExist();

    // The row title is untouched.
    const titles = await rowTitles();
    await expect(titles[0]).toBe("edit-fixture");
  });
});
