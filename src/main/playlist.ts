import { Track } from '../types';
import * as db from './db';

export function generate(count: number = 20): Track[] {
  return db.getRandomTracks(count);
}
