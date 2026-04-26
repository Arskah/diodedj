import { Generated, Insertable, Selectable } from "kysely";
import { ContentType } from "../../types";

export interface TracksTable {
  id: Generated<number>;
  path: string;
  content_type: Generated<ContentType>;
  title: string;
  artist: string;
  album: string;
  genre: string | null;
  year: number | null;
  duration: number;
  bpm: number | null;
  sample_rate: number | null;
  bitrate: number | null;
  format: string;
  play_count: Generated<number>;
  added_at: Generated<string>;
}

export interface Database {
  tracks: TracksTable;
}

export type Track = Selectable<TracksTable>;
export type TrackInsert = Insertable<TracksTable>;
