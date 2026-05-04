import { EventEmitter } from "events";
import { ContentType, ScanResult } from "../types";
import * as scanner from "./scanner";
import * as db from "./db";
import * as config from "./config";
import { logger } from "./logger";

export type ScanStatus =
  | { status: "idle"; lastResult: ScanResult | null }
  | { status: "running"; processed: number; total: number }
  | { status: "canceled"; processed: number; total: number; added: number }
  | { status: "error"; message: string };

export interface ScanProgress {
  processed: number;
  total: number;
}

const PROGRESS_THROTTLE_MS = 200;

const emitter = new EventEmitter();
let state: ScanStatus = { status: "idle", lastResult: null };
let abort: AbortController | null = null;
let runPromise: Promise<void> | null = null;
let lastProgressEmit = 0;

export function getStatus(): ScanStatus {
  return state;
}

export function onChange(cb: (s: ScanStatus) => void): () => void {
  emitter.on("change", cb);
  return () => emitter.off("change", cb);
}

export function onProgress(cb: (p: ScanProgress) => void): () => void {
  emitter.on("progress", cb);
  return () => emitter.off("progress", cb);
}

function setState(next: ScanStatus): void {
  state = next;
  emitter.emit("change", state);
}

export function isRunning(): boolean {
  return state.status === "running";
}

export function start(): { alreadyRunning: boolean } {
  if (isRunning()) return { alreadyRunning: true };
  abort = new AbortController();
  lastProgressEmit = 0;
  setState({ status: "running", processed: 0, total: 0 });
  runPromise = run(abort.signal);
  return { alreadyRunning: false };
}

export async function cancel(): Promise<void> {
  abort?.abort();
  if (runPromise) await runPromise.catch(() => {});
}

export async function waitForIdle(): Promise<void> {
  if (runPromise) await runPromise.catch(() => {});
}

async function run(signal: AbortSignal): Promise<void> {
  let cumulativeProcessed = 0;
  let cumulativeTotal = 0;
  let cumulativeAdded = 0;
  const liveByRoot = new Map<string, Set<string>>();

  try {
    const allPaths = config.getAllPathsFlat();
    await db.removeTracksNotInPaths(allPaths);

    const types: ContentType[] = ["music", "commercial", "jingle"];
    for (const type of types) {
      const paths = config.getPaths(type);
      for (const p of paths) {
        const result = await scanner.scanDirectory(
          p,
          type,
          (processed, total) => {
            const procNow = cumulativeProcessed + processed;
            const totalNow = cumulativeTotal + total;
            if (state.status === "running") {
              state = {
                status: "running",
                processed: procNow,
                total: totalNow,
              };
            }
            const now = Date.now();
            if (now - lastProgressEmit > PROGRESS_THROTTLE_MS) {
              lastProgressEmit = now;
              emitter.emit("progress", { processed: procNow, total: totalNow });
            }
          },
          signal,
        );
        cumulativeProcessed += result.total;
        cumulativeTotal += result.total;
        cumulativeAdded += result.added;
        liveByRoot.set(p, new Set(result.liveFiles ?? []));
        if (signal.aborted) {
          setState({
            status: "canceled",
            processed: cumulativeProcessed,
            total: cumulativeTotal,
            added: cumulativeAdded,
          });
          return;
        }
      }
    }

    let pruned = 0;
    for (const [root, live] of liveByRoot) {
      const dbPaths = await db.getPathsUnder(root);
      const stale = dbPaths.filter((dp) => !live.has(dp));
      if (stale.length) pruned += await db.deleteByPaths(stale);
    }
    if (pruned > 0) logger.info(`scan pruned ${pruned} missing files`);
    logger.info(
      `scan complete: ${cumulativeTotal} tracks (${
        cumulativeAdded > 0 ? `${cumulativeAdded} new/updated` : "no changes"
      })`,
    );
    setState({
      status: "idle",
      lastResult: { total: cumulativeTotal, added: cumulativeAdded },
    });
  } catch (err) {
    logger.error("scan failed", err);
    setState({
      status: "error",
      message: String((err as Error)?.message ?? err),
    });
  } finally {
    abort = null;
    runPromise = null;
  }
}
