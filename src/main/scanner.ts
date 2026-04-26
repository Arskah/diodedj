import fs from 'fs';
import path from 'path';
import { TrackInsert, ScanResult } from '../types';
import * as db from './db';

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a',
  '.wma', '.opus', '.aiff', '.aif'
]);

export async function scanDirectory(
  dirPath: string,
  onProgress?: (processed: number, total: number) => void
): Promise<ScanResult> {
  const mm = await import('music-metadata');
  const files = await findAudioFiles(dirPath);
  let processed = 0;
  let added = 0;

  for (const filePath of files) {
    try {
      const metadata = await mm.parseFile(filePath);
      const { common, format } = metadata;

      const track: TrackInsert = {
        path: filePath,
        title: common.title || path.basename(filePath, path.extname(filePath)),
        artist: common.artist || 'Unknown',
        album: common.album || 'Unknown',
        genre: common.genre?.[0] || null,
        year: common.year || null,
        duration: format.duration || 0,
        bpm: common.bpm || null,
        sample_rate: format.sampleRate || null,
        bitrate: format.bitrate || null,
        format: path.extname(filePath).slice(1).toLowerCase()
      };

      db.insertTrack(track);
      added++;
    } catch {
      // Skip files that fail to parse
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
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        await walk(fullPath);
      } else if (AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  }

  await walk(dirPath);
  return results;
}
