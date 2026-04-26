import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface AppConfig {
  libraryPaths: string[];
}

const defaults: AppConfig = {
  libraryPaths: []
};

let config: AppConfig;
let configPath: string;

export function init(): AppConfig {
  configPath = path.join(app.getPath('userData'), 'config.json');
  config = load();
  return config;
}

function load(): AppConfig {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

function save(): void {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function get(): AppConfig {
  return config;
}

export function getLibraryPaths(): string[] {
  return config.libraryPaths;
}

export function addLibraryPath(dirPath: string): boolean {
  const resolved = path.resolve(dirPath);
  if (config.libraryPaths.includes(resolved)) return false;
  config.libraryPaths.push(resolved);
  save();
  return true;
}

export function removeLibraryPath(dirPath: string): boolean {
  const resolved = path.resolve(dirPath);
  const idx = config.libraryPaths.indexOf(resolved);
  if (idx === -1) return false;
  config.libraryPaths.splice(idx, 1);
  save();
  return true;
}
