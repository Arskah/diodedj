import fs from "fs";
import path from "path";
import { ContentType, ScanResult } from "../types";
import * as db from "./db";
import { Track, TrackInsert } from "./db/types";
import { AUDIO_EXTENSIONS } from "./audio-formats";
import { logger } from "./logger";

export function shouldRescan(
  existing: Track | undefined,
  fileMtimeMs: number,
  contentType: ContentType,
): boolean {
  if (!existing) return true;
  if (existing.mtime == null) return true;
  if (existing.content_type !== contentType) return true;
  return Math.floor(existing.mtime) !== Math.floor(fileMtimeMs);
}

export async function scanDirectory(
  dirPath: string,
  contentType: ContentType = "music",
  onProgress?: (processed: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ScanResult> {
  const mm = await import("music-metadata");
  const files = await findAudioFiles(dirPath);
  let processed = 0;
  let added = 0;

  for (const filePath of files) {
    if (signal?.aborted) break;
    try {
      const stat = await fs.promises.stat(filePath);
      const mtimeMs = Math.floor(stat.mtimeMs);
      const existing = await db.getTrackByPath(filePath);

      if (!shouldRescan(existing, mtimeMs, contentType)) {
        processed++;
        if (onProgress) onProgress(processed, files.length);
        continue;
      }

      const metadata = await mm.parseFile(filePath);
      const { common, format } = metadata;

      const track: TrackInsert = {
        path: filePath,
        content_type: contentType,
        title: common.title || path.basename(filePath, path.extname(filePath)),
        artist: common.artist || "Unknown",
        album: common.album || "Unknown",
        genre: common.genre?.[0] || null,
        year: common.year || null,
        duration: format.duration || 0,
        bpm: common.bpm || null,
        sample_rate: format.sampleRate || null,
        bitrate: format.bitrate || null,
        format: path.extname(filePath).slice(1).toLowerCase(),
        mtime: mtimeMs,
      };

      await db.insertTrack(track);
      added++;
    } catch (err) {
      logger.error(`scan: failed to parse ${filePath}`, err);
    }

    processed++;
    if (onProgress) onProgress(processed, files.length);
  }

  return { total: files.length, added };
}

async function findAudioFiles(dirPath: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      logger.error(`scan: readdir failed ${dir}`, err);
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        await walk(fullPath);
      } else if (AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  }

  await walk(dirPath);
  return results;
}
