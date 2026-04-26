import { test as base, expect } from "@playwright/test";
import { launchApp, type LaunchOptions, type LaunchedApp } from "./helpers";
import {
  createFixtureLibrary,
  type FixtureLibrary,
  type FixtureSpec,
} from "./fixtures";

type Launch = (opts?: LaunchOptions) => Promise<LaunchedApp>;
type Library = (specs: {
  music?: FixtureSpec[];
  commercial?: FixtureSpec[];
  jingle?: FixtureSpec[];
}) => Promise<FixtureLibrary>;

type Fixtures = {
  launch: Launch;
  library: Library;
};

/* eslint-disable no-empty-pattern */
export const test = base.extend<Fixtures>({
  launch: async ({}, use) => {
    const apps: LaunchedApp[] = [];
    await use(async (opts) => {
      const a = await launchApp(opts);
      apps.push(a);
      return a;
    });
    for (const a of apps) {
      try {
        await a.cleanup();
      } catch {
        /* noop */
      }
    }
  },
  library: async ({}, use) => {
    const libs: FixtureLibrary[] = [];
    await use(async (specs) => {
      const lib = await createFixtureLibrary(specs);
      libs.push(lib);
      return lib;
    });
    for (const lib of libs) {
      try {
        await lib.cleanup();
      } catch {
        /* noop */
      }
    }
  },
});

export { expect };
