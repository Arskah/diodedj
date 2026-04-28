import { test, expect } from "../test";
import { clickScan, waitForPlaylistCount, waitForTrackCount } from "../helpers";

test.describe("playback", () => {
  test("clicking play on a track loads audio src and starts playing", async ({
    launch,
    library,
  }) => {
    const fx = await library({
      music: [{ name: "first-song", durationSec: 1 }],
    });
    const { win } = await launch({ musicPaths: [fx.musicDir] });

    await clickScan(win);
    await waitForTrackCount(win, 1);

    await win.evaluate(() => {
      (document.getElementById("audio") as HTMLAudioElement).muted = true;
    });

    await win.locator("#track-list .btn-play-track").first().click();

    await expect(win.locator("#np-title")).toHaveText("first-song");
    await expect(win.locator("#playlist .empty")).toContainText(
      "Playlist empty",
    );
    await win.waitForFunction(() => {
      const a = document.getElementById("audio") as HTMLAudioElement;
      return !!a.src && a.src.startsWith("media://track/");
    });
    await win.waitForFunction(() => {
      const a = document.getElementById("audio") as HTMLAudioElement;
      return a.paused === false;
    });
  });

  test("play button toggles pause/resume; stop clears src and now-playing", async ({
    launch,
    library,
  }) => {
    const fx = await library({
      music: [{ name: "loop-track", durationSec: 1 }],
    });
    const { win } = await launch({ musicPaths: [fx.musicDir] });

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

    await win.click("#btn-play");
    await win.waitForFunction(() => {
      const a = document.getElementById("audio") as HTMLAudioElement;
      return a.paused === true;
    });

    await win.click("#btn-play");
    await win.waitForFunction(() => {
      const a = document.getElementById("audio") as HTMLAudioElement;
      return a.paused === false;
    });

    await win.click("#btn-stop");
    await expect(win.locator("#np-title")).toHaveText("No track loaded");
    await expect(win.locator("#time-display")).toHaveText("0:00 / 0:00");
    const hasSrc = await win.evaluate(() =>
      (document.getElementById("audio") as HTMLAudioElement).hasAttribute(
        "src",
      ),
    );
    expect(hasSrc).toBe(false);
  });

  test("next consumes queue head; prev restarts current", async ({
    launch,
    library,
  }) => {
    const fx = await library({
      music: [
        { name: "song-a", durationSec: 30 },
        { name: "song-b", durationSec: 30 },
        { name: "song-c", durationSec: 30 },
      ],
    });
    const { win } = await launch({ musicPaths: [fx.musicDir] });

    await clickScan(win);
    await waitForTrackCount(win, 3);
    await win.evaluate(() => {
      const a = document.getElementById("audio") as HTMLAudioElement;
      a.muted = true;
    });

    const addButtons = win.locator("#track-list .btn-add");
    const count = await addButtons.count();
    for (let i = 0; i < count; i++) {
      await addButtons.nth(i).click();
    }
    await waitForPlaylistCount(win, 3);

    await win.locator("#playlist .playlist-row").first().dblclick();
    await expect(win.locator("#np-title")).toHaveText("song-a");
    await expect(win.locator("#playlist .playlist-row")).toHaveCount(2);

    await win.click("#btn-next");
    await expect(win.locator("#np-title")).toHaveText("song-b");
    await expect(win.locator("#playlist .playlist-row")).toHaveCount(1);

    await win.evaluate(() => {
      const a = document.getElementById("audio") as HTMLAudioElement;
      a.pause();
      a.currentTime = 5;
    });
    await win.click("#btn-prev");
    await expect(win.locator("#np-title")).toHaveText("song-b");
    const t = await win.evaluate(
      () => (document.getElementById("audio") as HTMLAudioElement).currentTime,
    );
    expect(t).toBeLessThan(2);

    // Within 3s of start, prev pulls the previously-played track back from history
    await win.evaluate(() => {
      const a = document.getElementById("audio") as HTMLAudioElement;
      a.pause();
      a.currentTime = 1;
    });
    await win.click("#btn-prev");
    await expect(win.locator("#np-title")).toHaveText("song-a");
    await expect(win.locator("#playlist .playlist-row")).toHaveCount(2);
  });

  test("clearing playlist keeps current track playing", async ({
    launch,
    library,
  }) => {
    const fx = await library({
      music: [
        { name: "keep-playing", durationSec: 1 },
        { name: "queued-1", durationSec: 1 },
        { name: "queued-2", durationSec: 1 },
      ],
    });
    const { win } = await launch({ musicPaths: [fx.musicDir] });

    await clickScan(win);
    await waitForTrackCount(win, 3);
    await win.evaluate(() => {
      (document.getElementById("audio") as HTMLAudioElement).muted = true;
    });

    const addButtons = win.locator("#track-list .btn-add");
    const count = await addButtons.count();
    for (let i = 0; i < count; i++) {
      await addButtons.nth(i).click();
    }
    await waitForPlaylistCount(win, 3);

    await win.locator("#playlist .playlist-row").first().dblclick();
    await expect(win.locator("#np-title")).toHaveText("keep-playing");
    await win.waitForFunction(() => {
      const a = document.getElementById("audio") as HTMLAudioElement;
      return a.paused === false;
    });

    await win.click("#btn-clear-playlist");
    await expect(win.locator("#playlist .empty")).toContainText(
      "Playlist empty",
    );
    await expect(win.locator("#np-title")).toHaveText("keep-playing");
    const paused = await win.evaluate(
      () => (document.getElementById("audio") as HTMLAudioElement).paused,
    );
    expect(paused).toBe(false);
  });

  test("volume slider updates audio volume", async ({ launch, library }) => {
    const fx = await library({
      music: [{ name: "vol-track", durationSec: 1 }],
    });
    const { win } = await launch({ musicPaths: [fx.musicDir] });

    await clickScan(win);
    await waitForTrackCount(win, 1);

    await win.locator("#volume").fill("0.42");
    await win.locator("#volume").dispatchEvent("input");
    const vol = await win.evaluate(
      () => (document.getElementById("audio") as HTMLAudioElement).volume,
    );
    expect(vol).toBeCloseTo(0.42, 2);
  });

  test("AUTO/MANUAL toggle changes mode label", async ({ launch }) => {
    const { win } = await launch();
    await expect(win.locator("#btn-mode")).toHaveText("AUTO");
    await win.click("#btn-mode");
    await expect(win.locator("#btn-mode")).toHaveText("MANUAL");
    await win.click("#btn-mode");
    await expect(win.locator("#btn-mode")).toHaveText("AUTO");
  });
});
