#!/usr/bin/env node
// Fetches a pinned mpv binary into vendor/mpv/<platform>/.
// Skips on Linux (uses system mpv).
//
// macOS: standalone tarball from laboratory.stolendata.net.
// Windows: shinchiro static build from github.com/shinchiro/mpv-winbuild-cmake.
//
// Re-runs are idempotent; existing binary is reused unless --force is passed.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import https from "node:https";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = path.join(ROOT, "vendor", "mpv");

// Pinned versions. Bump intentionally via PR.
const MPV_VERSION = "0.40.0";
const MAC_BUILD_TAG = "2025-04-13";
const WIN_BUILD_TAG = "2025-04-13";

const FORCE = process.argv.includes("--force");

async function main() {
  const platform = process.platform;
  if (platform === "linux") {
    log("linux: using system mpv (no fetch)");
    return;
  }
  if (platform !== "darwin" && platform !== "win32") {
    fail(`unsupported platform: ${platform}`);
  }

  if (platform === "darwin") {
    await fetchDarwin("arm64");
    await fetchDarwin("x64");
  } else {
    await fetchWin32();
  }
}

async function fetchDarwin(arch) {
  const dir = path.join(VENDOR, "darwin");
  const target = path.join(dir, "mpv");
  if (!FORCE && fs.existsSync(target)) {
    log(`darwin: ${target} exists, skipping (use --force to refetch)`);
    return;
  }

  // For now we only ship a single binary regardless of arch under
  // vendor/mpv/darwin/mpv. Both arch get the same path; electron-builder
  // copies it into both arch-specific bundles.
  const archStr = arch === "arm64" ? "arm64" : "x86_64";
  const url = `https://laboratory.stolendata.net/~djinn/mpv_osx/mpv-${archStr}-apple-darwin-${MAC_BUILD_TAG}.tar.gz`;
  const tmp = path.join(os.tmpdir(), `mpv-darwin-${arch}.tar.gz`);

  log(`darwin/${arch}: downloading ${url}`);
  await download(url, tmp);
  fs.mkdirSync(dir, { recursive: true });

  // Tarball contains mpv.app/Contents/MacOS/mpv
  log(`darwin/${arch}: extracting`);
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "mpv-extract-"));
  execFileSync("tar", ["-xzf", tmp, "-C", extractDir], { stdio: "inherit" });
  const candidates = walk(extractDir).filter((p) => path.basename(p) === "mpv");
  if (candidates.length === 0) {
    fail("no mpv binary found in tarball");
  }
  fs.copyFileSync(candidates[0], target);
  fs.chmodSync(target, 0o755);
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.unlinkSync(tmp);
  log(`darwin/${arch}: installed to ${target}`);
}

async function fetchWin32() {
  const dir = path.join(VENDOR, "win32");
  const target = path.join(dir, "mpv.exe");
  if (!FORCE && fs.existsSync(target)) {
    log(`win32: ${target} exists, skipping (use --force to refetch)`);
    return;
  }

  const url = `https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/${WIN_BUILD_TAG}/mpv-x86_64-v3-${WIN_BUILD_TAG}-git-${MPV_VERSION}.7z`;
  const tmp = path.join(os.tmpdir(), "mpv-win32.7z");

  log(`win32: downloading ${url}`);
  await download(url, tmp);
  fs.mkdirSync(dir, { recursive: true });

  log("win32: extracting (requires 7z on PATH)");
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "mpv-extract-"));
  execFileSync("7z", ["x", `-o${extractDir}`, tmp], { stdio: "inherit" });
  const candidates = walk(extractDir).filter(
    (p) => path.basename(p).toLowerCase() === "mpv.exe",
  );
  if (candidates.length === 0) fail("mpv.exe not found in 7z");
  fs.copyFileSync(candidates[0], target);
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.unlinkSync(tmp);
  log(`win32: installed to ${target}`);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req = https.get(url, { timeout: 60_000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        res.resume();
        download(res.headers.location, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    file.on("error", reject);
  });
}

function log(...args) {
  console.log("[fetch-mpv]", ...args);
}

function fail(msg) {
  console.error("[fetch-mpv] fatal:", msg);
  process.exit(1);
}

main().catch((err) => fail(err?.stack ?? String(err)));
