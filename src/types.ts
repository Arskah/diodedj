export type ContentType = "music" | "commercial" | "jingle";

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
