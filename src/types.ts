export interface Track {
  id: number;
  path: string;
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
  added_at: string;
}

export interface TrackInsert {
  path: string;
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
