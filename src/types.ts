export type ContentType = "music" | "commercial" | "jingle";

export type SortColumn = "title" | "artist" | "album" | "play_count";
export type SortDir = "asc" | "desc";

export interface SortOption {
  column: SortColumn;
  dir: SortDir;
}

export interface Track {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  play_count: number;
  genre?: string | null;
  year?: number | null;
  bpm?: number | null;
  sample_rate?: number | null;
  bitrate?: number | null;
  format?: string;
}

export interface LibraryStats {
  totalTracks: number;
  totalArtists: number;
  totalAlbums: number;
  totalHours: number;
}

export interface ScanResult {
  total: number;
  added: number;
}
