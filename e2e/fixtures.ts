import fs from "fs/promises";
import os from "os";
import path from "path";

function buildWav(durationSec: number, sampleRate = 22050): Buffer {
  const numSamples = Math.max(1, Math.floor(sampleRate * durationSec));
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  let o = 0;
  buf.write("RIFF", o);
  o += 4;
  buf.writeUInt32LE(36 + dataSize, o);
  o += 4;
  buf.write("WAVE", o);
  o += 4;
  buf.write("fmt ", o);
  o += 4;
  buf.writeUInt32LE(16, o);
  o += 4;
  buf.writeUInt16LE(1, o);
  o += 2;
  buf.writeUInt16LE(1, o);
  o += 2;
  buf.writeUInt32LE(sampleRate, o);
  o += 4;
  buf.writeUInt32LE(sampleRate * 2, o);
  o += 4;
  buf.writeUInt16LE(2, o);
  o += 2;
  buf.writeUInt16LE(16, o);
  o += 2;
  buf.write("data", o);
  o += 4;
  buf.writeUInt32LE(dataSize, o);
  return buf;
}

export interface FixtureSpec {
  name: string;
  durationSec?: number;
}

export interface FixtureLibrary {
  rootDir: string;
  musicDir: string;
  commercialDir: string;
  jingleDir: string;
  files: { music: string[]; commercial: string[]; jingle: string[] };
  cleanup: () => Promise<void>;
}

export async function createFixtureLibrary(specs: {
  music?: FixtureSpec[];
  commercial?: FixtureSpec[];
  jingle?: FixtureSpec[];
}): Promise<FixtureLibrary> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "radiodiodj-fixtures-"));
  const musicDir = path.join(root, "music");
  const commercialDir = path.join(root, "commercials");
  const jingleDir = path.join(root, "jingles");
  await Promise.all([
    fs.mkdir(musicDir, { recursive: true }),
    fs.mkdir(commercialDir, { recursive: true }),
    fs.mkdir(jingleDir, { recursive: true }),
  ]);

  async function writeAll(
    dir: string,
    items: FixtureSpec[],
  ): Promise<string[]> {
    const paths: string[] = [];
    for (const item of items) {
      const filePath = path.join(dir, `${item.name}.wav`);
      await fs.writeFile(filePath, buildWav(item.durationSec ?? 1.0));
      paths.push(filePath);
    }
    return paths;
  }

  const files = {
    music: await writeAll(musicDir, specs.music ?? []),
    commercial: await writeAll(commercialDir, specs.commercial ?? []),
    jingle: await writeAll(jingleDir, specs.jingle ?? []),
  };

  return {
    rootDir: root,
    musicDir,
    commercialDir,
    jingleDir,
    files,
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  };
}
