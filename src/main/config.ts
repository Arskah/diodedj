import fs from "fs";
import path from "path";
import { app } from "electron";
import { ContentType } from "../types";

export interface AppConfig {
  musicPaths: string[];
  commercialPaths: string[];
  jinglePaths: string[];
}

const defaults: AppConfig = {
  musicPaths: [],
  commercialPaths: [],
  jinglePaths: [],
};

let config: AppConfig;
let configPath: string;

export function init(): AppConfig {
  configPath = path.join(app.getPath("userData"), "config.json");
  config = load();
  return config;
}

function load(): AppConfig {
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    // Migrate old config format
    if (parsed.libraryPaths && !parsed.musicPaths) {
      parsed.musicPaths = parsed.libraryPaths;
      delete parsed.libraryPaths;
    }
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
}

function save(): void {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function getPathsArray(type: ContentType): string[] {
  switch (type) {
    case "music":
      return config.musicPaths;
    case "commercial":
      return config.commercialPaths;
    case "jingle":
      return config.jinglePaths;
  }
}

export function getPaths(type: ContentType): string[] {
  return getPathsArray(type);
}

export function getAllPaths(): Record<ContentType, string[]> {
  return {
    music: config.musicPaths,
    commercial: config.commercialPaths,
    jingle: config.jinglePaths,
  };
}

export function getAllPathsFlat(): string[] {
  return [
    ...config.musicPaths,
    ...config.commercialPaths,
    ...config.jinglePaths,
  ];
}

export function addPath(type: ContentType, dirPath: string): boolean {
  const resolved = path.resolve(dirPath);
  const arr = getPathsArray(type);
  if (arr.includes(resolved)) return false;
  arr.push(resolved);
  save();
  return true;
}

export function removePath(type: ContentType, dirPath: string): boolean {
  const resolved = path.resolve(dirPath);
  const arr = getPathsArray(type);
  const idx = arr.indexOf(resolved);
  if (idx === -1) return false;
  arr.splice(idx, 1);
  save();
  return true;
}
