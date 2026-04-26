const audio = document.getElementById("audio") as HTMLAudioElement;
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const trackList = document.getElementById("track-list")!;
const playlistEl = document.getElementById("playlist")!;
const playlistCount = document.getElementById("playlist-count")!;
const btnPaths = document.getElementById("btn-paths")!;
const btnScan = document.getElementById("btn-scan")!;
const btnGenerate = document.getElementById("btn-generate")!;
const btnPrev = document.getElementById("btn-prev")!;
const btnPlay = document.getElementById("btn-play")!;
const btnStop = document.getElementById("btn-stop")!;
const btnNext = document.getElementById("btn-next")!;
const volumeSlider = document.getElementById("volume") as HTMLInputElement;
const npTitle = document.getElementById("np-title")!;
const npArtist = document.getElementById("np-artist")!;
const timeDisplay = document.getElementById("time-display")!;
const progressFill = document.getElementById("progress-fill")!;
const progressBar = document.getElementById("progress-bar")!;
const libraryStats = document.getElementById("library-stats")!;
const pathsOverlay = document.getElementById("paths-overlay")!;
const pathsList = document.getElementById("paths-list")!;
const btnAddPath = document.getElementById("btn-add-path")!;
const btnClosePaths = document.getElementById("btn-close-paths")!;
const scanOverlay = document.getElementById("scan-overlay")!;
const scanStatus = document.getElementById("scan-status")!;
const scanBarFill = document.getElementById("scan-bar-fill")!;

type Track = {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
};

const currentPlaylist: Track[] = [];
let currentIndex = -1;
let autoPlaylistActive = false;
const AUTO_PLAYLIST_BUFFER = 5;

// --- Search ---

let searchTimeout: number;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimeout);
  searchTimeout = window.setTimeout(doSearch, 250);
});

async function doSearch(): Promise<void> {
  const query = searchInput.value;
  const tracks = await window.api.search(query);
  renderTrackList(tracks);
}

function renderTrackList(tracks: Track[]): void {
  trackList.innerHTML = "";
  if (tracks.length === 0) {
    trackList.innerHTML = '<div class="empty">No tracks found</div>';
    return;
  }
  for (const track of tracks) {
    const row = document.createElement("div");
    row.className = "track-row";
    row.innerHTML = `
      <span class="track-title">${esc(track.title)}</span>
      <span class="track-artist">${esc(track.artist)}</span>
      <span class="track-album">${esc(track.album)}</span>
      <span class="track-duration">${formatTime(track.duration)}</span>
      <button class="btn-add" title="Add to playlist">+</button>
    `;
    row.querySelector(".btn-add")!.addEventListener("click", (e) => {
      e.stopPropagation();
      addToPlaylist(track);
    });
    row.addEventListener("dblclick", () => {
      addToPlaylist(track);
      playIndex(currentPlaylist.length - 1);
    });
    trackList.appendChild(row);
  }
}

// --- Playlist ---

function addToPlaylist(track: Track): void {
  currentPlaylist.push(track);
  renderPlaylist();
}

function renderPlaylist(): void {
  playlistCount.textContent = `(${currentPlaylist.length})`;
  playlistEl.innerHTML = "";
  if (currentPlaylist.length === 0) {
    playlistEl.innerHTML = '<div class="empty">Playlist empty</div>';
    return;
  }
  currentPlaylist.forEach((track, i) => {
    const row = document.createElement("div");
    row.className = "playlist-row" + (i === currentIndex ? " active" : "");
    row.innerHTML = `
      <span class="pl-num">${i + 1}</span>
      <span class="pl-title">${esc(track.title)}</span>
      <span class="pl-artist">${esc(track.artist)}</span>
      <span class="pl-duration">${formatTime(track.duration)}</span>
      <button class="btn-remove" title="Remove">&#10005;</button>
    `;
    row.querySelector(".btn-remove")!.addEventListener("click", (e) => {
      e.stopPropagation();
      removeFromPlaylist(i);
    });
    row.addEventListener("dblclick", () => playIndex(i));
    playlistEl.appendChild(row);
  });
}

function removeFromPlaylist(index: number): void {
  currentPlaylist.splice(index, 1);
  if (index < currentIndex) currentIndex--;
  else if (index === currentIndex) {
    stopPlayback();
    currentIndex = -1;
  }
  renderPlaylist();
}

// --- Playback ---

function playIndex(index: number): void {
  if (index < 0 || index >= currentPlaylist.length) return;
  currentIndex = index;
  const track = currentPlaylist[index];
  audio.src = window.api.getMediaUrl(track.id);
  audio.play();
  updateNowPlaying(track);
  renderPlaylist();
  maybeRefillPlaylist();
}

function updateNowPlaying(track: Track): void {
  npTitle.textContent = track.title;
  npArtist.textContent = track.artist;
  document.title = `${track.title} - ${track.artist} | DiodeDJ`;
}

function stopPlayback(): void {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  currentIndex = -1;
  autoPlaylistActive = false;
  btnGenerate.classList.remove("active");
  npTitle.textContent = "No track loaded";
  npArtist.textContent = "";
  timeDisplay.textContent = "0:00 / 0:00";
  progressFill.style.width = "0%";
  btnPlay.innerHTML = "&#9654;";
  document.title = "DiodeDJ";
}

btnPlay.addEventListener("click", () => {
  if (currentIndex === -1) {
    if (currentPlaylist.length > 0) playIndex(0);
    return;
  }
  if (audio.paused) {
    audio.play().catch((err) => console.error("Resume failed:", err));
  } else {
    audio.pause();
  }
});

btnStop.addEventListener("click", stopPlayback);

btnNext.addEventListener("click", () => {
  if (currentIndex < currentPlaylist.length - 1) {
    playIndex(currentIndex + 1);
  }
});

btnPrev.addEventListener("click", () => {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
  } else if (currentIndex > 0) {
    playIndex(currentIndex - 1);
  }
});

volumeSlider.addEventListener("input", () => {
  audio.volume = parseFloat(volumeSlider.value);
});

audio.addEventListener("play", () => {
  btnPlay.innerHTML = "&#9208;";
});
audio.addEventListener("pause", () => {
  btnPlay.innerHTML = "&#9654;";
});

audio.addEventListener("timeupdate", () => {
  timeDisplay.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration || 0)}`;
  const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  progressFill.style.width = pct + "%";
});

audio.addEventListener("ended", async () => {
  if (currentIndex < currentPlaylist.length - 1) {
    playIndex(currentIndex + 1);
  } else if (autoPlaylistActive) {
    await maybeRefillPlaylist();
    if (currentIndex < currentPlaylist.length - 1) {
      playIndex(currentIndex + 1);
    }
  } else {
    stopPlayback();
    renderPlaylist();
  }
});

progressBar.addEventListener("click", (e) => {
  if (!audio.duration) return;
  const rect = progressBar.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  audio.currentTime = pct * audio.duration;
});

// --- Library Paths ---

btnPaths.addEventListener("click", () => {
  renderPaths();
  pathsOverlay.classList.remove("hidden");
});

btnClosePaths.addEventListener("click", () => {
  pathsOverlay.classList.add("hidden");
});

btnAddPath.addEventListener("click", async () => {
  const added = await window.api.addLibraryPath();
  if (added) renderPaths();
});

async function renderPaths(): Promise<void> {
  const paths = await window.api.getLibraryPaths();
  pathsList.innerHTML = "";
  if (paths.length === 0) {
    pathsList.innerHTML =
      '<div class="empty">No library paths configured</div>';
    return;
  }
  for (const p of paths) {
    const row = document.createElement("div");
    row.className = "path-row";
    row.innerHTML = `
      <span class="path-text">${esc(p)}</span>
      <button class="btn-remove" title="Remove">&#10005;</button>
    `;
    row.querySelector(".btn-remove")!.addEventListener("click", async () => {
      await window.api.removeLibraryPath(p);
      renderPaths();
    });
    pathsList.appendChild(row);
  }
}

// --- Library Scan ---

btnScan.addEventListener("click", async () => {
  scanOverlay.classList.remove("hidden");
  scanStatus.textContent = "Scanning...";
  scanBarFill.style.width = "0%";

  await window.api.scanLibrary();

  scanOverlay.classList.add("hidden");
  doSearch();
  loadStats();
});

window.api.onScanProgress(({ processed, total }) => {
  scanStatus.textContent = `${processed} / ${total} files`;
  scanBarFill.style.width = (processed / total) * 100 + "%";
});

// --- Auto Playlist ---

btnGenerate.addEventListener("click", () => {
  toggleAutoPlaylist();
});

function toggleAutoPlaylist(): void {
  autoPlaylistActive = !autoPlaylistActive;
  btnGenerate.classList.toggle("active", autoPlaylistActive);

  if (autoPlaylistActive) {
    maybeRefillPlaylist();
    if (currentIndex === -1 && currentPlaylist.length > 0) {
      playIndex(0);
    }
  }
}

async function maybeRefillPlaylist(): Promise<void> {
  if (!autoPlaylistActive) return;
  const remaining = currentPlaylist.length - currentIndex - 1;
  if (remaining < AUTO_PLAYLIST_BUFFER) {
    const count = AUTO_PLAYLIST_BUFFER - remaining;
    const tracks = await window.api.generatePlaylist(count);
    currentPlaylist.push(...tracks);
    renderPlaylist();
  }
}

// --- Stats ---

async function loadStats(): Promise<void> {
  const stats = await window.api.getStats();
  if (stats.totalTracks > 0) {
    libraryStats.textContent = `${stats.totalTracks} tracks | ${stats.totalArtists} artists | ${stats.totalHours}h`;
  }
}

// --- Helpers ---

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function esc(str: string): string {
  if (!str) return "";
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}

// --- Init ---

doSearch();
loadStats();
renderPlaylist();
