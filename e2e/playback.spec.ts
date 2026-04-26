import { test, expect } from "@playwright/test";
import { createFixtureLibrary } from "./fixtures";
import {
  clickScan,
  launchApp,
  waitForPlaylistCount,
  waitForTrackCount,
} from "./helpers";

test.describe("playback", () => {
  test("clicking play on a track loads audio src and starts playing", async () => {
    const fx = await createFixtureLibrary({
      music: [{ name: "first-song", durationSec: 1 }],
    });
    const { win, cleanup } = await launchApp({ musicPaths: [fx.musicDir] });
    try {
      await clickScan(win);
      await waitForTrackCount(win, 1);

      // Mute renderer audio so test machine stays quiet
      await win.evaluate(() => {
        (document.getElementById("audio") as HTMLAudioElement).muted = true;
      });

      await win.locator("#track-list .btn-play-track").first().click();

      await waitForPlaylistCount(win, 1);
      await expect(win.locator("#np-title")).toHaveText("first-song");
      await win.waitForFunction(() => {
        const a = document.getElementById("audio") as HTMLAudioElement;
        return !!a.src && a.src.startsWith("media://track/");
      });
      await win.waitForFunction(() => {
        const a = document.getElementById("audio") as HTMLAudioElement;
        return a.paused === false;
      });
    } finally {
      await cleanup();
      await fx.cleanup();
    }
  });

  test("play button toggles pause/resume; stop clears src and now-playing", async () => {
    const fx = await createFixtureLibrary({
      music: [{ name: "loop-track", durationSec: 1 }],
    });
    const { win, cleanup } = await launchApp({ musicPaths: [fx.musicDir] });
    try {
      await clickScan(win);
      await waitForTrackCount(win, 1);
      await win.evaluate(() => {
        (document.getElementById("audio") as HTMLAudioElement).muted = true;
      });

      await win.locator("#track-list .btn-play-track").first().click();
      await win.waitForFunction(() => {
        const a = document.getElementById("audio") as HTMLAudioElement;
        return a.paused === false;
      });

      // Pause
      await win.click("#btn-play");
      await win.waitForFunction(() => {
        const a = document.getElementById("audio") as HTMLAudioElement;
        return a.paused === true;
      });

      // Resume
      await win.click("#btn-play");
      await win.waitForFunction(() => {
        const a = document.getElementById("audio") as HTMLAudioElement;
        return a.paused === false;
      });

      // Stop clears state
      await win.click("#btn-stop");
      await expect(win.locator("#np-title")).toHaveText("No track loaded");
      await expect(win.locator("#time-display")).toHaveText("0:00 / 0:00");
      const hasSrc = await win.evaluate(() =>
        (document.getElementById("audio") as HTMLAudioElement).hasAttribute(
          "src",
        ),
      );
      expect(hasSrc).toBe(false);
    } finally {
      await cleanup();
      await fx.cleanup();
    }
  });

  test("next/prev navigate the playlist", async () => {
    const fx = await createFixtureLibrary({
      music: [
        { name: "song-a", durationSec: 1 },
        { name: "song-b", durationSec: 1 },
        { name: "song-c", durationSec: 1 },
      ],
    });
    const { win, cleanup } = await launchApp({ musicPaths: [fx.musicDir] });
    try {
      await clickScan(win);
      await waitForTrackCount(win, 3);
      await win.evaluate(() => {
        (document.getElementById("audio") as HTMLAudioElement).muted = true;
      });

      // Add all three to playlist via the + button
      const addButtons = win.locator("#track-list .btn-add");
      const count = await addButtons.count();
      for (let i = 0; i < count; i++) {
        await addButtons.nth(i).click();
      }
      await waitForPlaylistCount(win, 3);

      await win.locator("#playlist .playlist-row").first().dblclick();
      await win.waitForFunction(
        () =>
          document
            .querySelector("#playlist .playlist-row.active")
            ?.textContent?.includes("song-a") ?? false,
      );

      await win.click("#btn-next");
      await win.waitForFunction(
        () =>
          document
            .querySelector("#playlist .playlist-row.active")
            ?.textContent?.includes("song-b") ?? false,
      );

      // Skip past intro window so prev goes to previous track, not seek-to-zero
      await win.evaluate(() => {
        const a = document.getElementById("audio") as HTMLAudioElement;
        a.currentTime = 0; // ensures < 3s rule fires
      });
      await win.click("#btn-prev");
      await win.waitForFunction(
        () =>
          document
            .querySelector("#playlist .playlist-row.active")
            ?.textContent?.includes("song-a") ?? false,
      );
    } finally {
      await cleanup();
      await fx.cleanup();
    }
  });

  test("volume slider updates audio volume", async () => {
    const fx = await createFixtureLibrary({
      music: [{ name: "vol-track", durationSec: 1 }],
    });
    const { win, cleanup } = await launchApp({ musicPaths: [fx.musicDir] });
    try {
      await clickScan(win);
      await waitForTrackCount(win, 1);

      await win.locator("#volume").fill("0.42");
      await win.locator("#volume").dispatchEvent("input");
      const vol = await win.evaluate(
        () => (document.getElementById("audio") as HTMLAudioElement).volume,
      );
      expect(vol).toBeCloseTo(0.42, 2);
    } finally {
      await cleanup();
      await fx.cleanup();
    }
  });

  test("AUTO/MANUAL toggle changes mode label", async () => {
    const { win, cleanup } = await launchApp();
    try {
      await expect(win.locator("#btn-mode")).toHaveText("AUTO");
      await win.click("#btn-mode");
      await expect(win.locator("#btn-mode")).toHaveText("MANUAL");
      await win.click("#btn-mode");
      await expect(win.locator("#btn-mode")).toHaveText("AUTO");
    } finally {
      await cleanup();
    }
  });
});
