import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: () => "/tmp" } }));
vi.mock("electron-log/main", () => ({
  default: {
    initialize: vi.fn(),
    transports: { file: {}, console: {} },
    create: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  },
}));
vi.mock("../../src/main/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn(),
  },
}));
vi.mock("../../src/main/db", () => ({
  removeTracksNotInPaths: vi.fn(async () => 0),
}));
vi.mock("../../src/main/config", () => ({
  getAllPathsFlat: () => ["/lib/music"],
  getPaths: (type: string) => (type === "music" ? ["/lib/music"] : []),
}));

const scanDirectory = vi.fn();
vi.mock("../../src/main/scanner", () => ({
  scanDirectory: (...args: unknown[]) => scanDirectory(...args),
}));

import * as scanState from "../../src/main/scanState";

function abortableMock(
  result: { total: number; added: number } = { total: 0, added: 0 },
): void {
  scanDirectory.mockImplementation(async (_p, _t, _op, signal) => {
    await new Promise<void>((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      signal?.addEventListener("abort", () => resolve());
    });
    return result;
  });
}

beforeEach(() => {
  scanDirectory.mockReset();
});

afterEach(async () => {
  if (scanState.isRunning()) await scanState.cancel();
});

describe("scanState", () => {
  it("starts as idle (or canceled from prior test) and is not running", () => {
    expect(scanState.isRunning()).toBe(false);
  });

  it("transitions running → idle with lastResult on completion", async () => {
    scanDirectory.mockImplementation(async (_p, _t, onProgress) => {
      onProgress?.(5, 10);
      onProgress?.(10, 10);
      return { total: 10, added: 7 };
    });

    const transitions: string[] = [];
    const off = scanState.onChange((s) => transitions.push(s.status));

    const r = scanState.start();
    expect(r).toEqual({ alreadyRunning: false });
    expect(scanState.isRunning()).toBe(true);

    await scanState.waitForIdle();

    const s = scanState.getStatus();
    expect(s.status).toBe("idle");
    if (s.status === "idle") {
      expect(s.lastResult).toEqual({ total: 10, added: 7 });
    }
    expect(transitions).toEqual(["running", "idle"]);
    off();
  });

  it("rejects re-entry while running", async () => {
    abortableMock();
    scanState.start();
    const r2 = scanState.start();
    expect(r2).toEqual({ alreadyRunning: true });
  });

  it("cancel transitions to canceled and aborts scanner", async () => {
    let receivedSignal: AbortSignal | undefined;
    scanDirectory.mockImplementation(async (_p, _t, _op, signal) => {
      receivedSignal = signal as AbortSignal;
      await new Promise<void>((resolve) => {
        signal?.addEventListener("abort", () => resolve());
      });
      return { total: 0, added: 0 };
    });

    scanState.start();
    await new Promise((r) => setTimeout(r, 10));
    await scanState.cancel();

    const s = scanState.getStatus();
    expect(s.status).toBe("canceled");
    expect(receivedSignal?.aborted).toBe(true);
  });

  it("transitions to error when scanner throws", async () => {
    scanDirectory.mockImplementation(async () => {
      throw new Error("boom");
    });

    scanState.start();
    await scanState.waitForIdle();

    const s = scanState.getStatus();
    expect(s.status).toBe("error");
    if (s.status === "error") expect(s.message).toContain("boom");
  });

  it("emits progress events from scanner callbacks", async () => {
    scanDirectory.mockImplementation(async (_p, _t, onProgress) => {
      onProgress?.(1, 100);
      await new Promise((r) => setTimeout(r, 250));
      onProgress?.(50, 100);
      await new Promise((r) => setTimeout(r, 250));
      onProgress?.(100, 100);
      return { total: 100, added: 50 };
    });

    const progress: Array<{ processed: number; total: number }> = [];
    const off = scanState.onProgress((p) => progress.push(p));

    scanState.start();
    await scanState.waitForIdle();

    expect(progress.length).toBeGreaterThanOrEqual(2);
    off();
  });
});
