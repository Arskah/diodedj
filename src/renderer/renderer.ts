const audio = document.getElementById("audio") as HTMLAudioElement;
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const trackList = document.getElementById("track-list")!;
const playlistEl = document.getElementById("playlist")!;
const playlistCount = document.getElementById("playlist-count")!;
const btnPaths = document.getElementById("btn-paths")!;
const btnScan = document.getElementById("btn-scan")!;
const btnGenerate = document.getElementById("btn-generate")!;
const btnClearPlaylist = document.getElementById("btn-clear-playlist")!;
const btnMode = document.getElementById("btn-mode")!;
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
  play_count: number;
};

const currentPlaylist: Track[] = [];
let currentIndex = -1;
let autoPlaylistActive = false;
const AUTO_PLAYLIST_BUFFER = 5;
let autoAdvance = true;
let activeLibraryTab: ContentType = "music";

// --- Library Tabs ---

const libTabs = document.querySelectorAll(".lib-tab");
libTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    libTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    activeLibraryTab = (tab as HTMLElement).dataset.type as ContentType;
    doSearch();
  });
});

// --- Search ---

let searchTimeout: number;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimeout);
  searchTimeout = window.setTimeout(doSearch, 250);
});

async function doSearch(): Promise<void> {
  const query = searchInput.value;
  const tracks = await window.api.search(query, activeLibraryTab);
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
      <span class="track-plays">${track.play_count || 0}</span>
      <span class="track-duration">${formatTime(track.duration)}</span>
      <button class="btn-play-track" title="Add and play">&#9654;</button>
      <button class="btn-add" title="Add to playlist">+</button>
    `;
    row.querySelector(".btn-play-track")!.addEventListener("click", (e) => {
      e.stopPropagation();
      addToPlaylist(track);
      playIndex(currentPlaylist.length - 1);
    });
    row.querySelector(".btn-add")!.addEventListener("click", (e) => {
      e.stopPropagation();
      addToPlaylist(track);
    });
    row.addEventListener("dblclick", () => {
      addToPlaylist(track);
    });
    trackList.appendChild(row);
  }
}

// --- Playlist ---

function addToPlaylist(track: Track): void {
  currentPlaylist.push(track);
  renderPlaylist();
}

let dragFromIndex = -1;

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
    row.draggable = true;
    row.dataset.index = String(i);
    row.innerHTML = `
      <span class="pl-drag">&#8942;</span>
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

    row.addEventListener("dragstart", () => {
      dragFromIndex = i;
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      dragFromIndex = -1;
      playlistEl
        .querySelectorAll(".drag-over")
        .forEach((el) => el.classList.remove("drag-over"));
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over");
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("drag-over");
      const toIndex = i;
      if (dragFromIndex === -1 || dragFromIndex === toIndex) return;
      movePlaylistItem(dragFromIndex, toIndex);
    });

    playlistEl.appendChild(row);
  });
}

function movePlaylistItem(from: number, to: number): void {
  const [item] = currentPlaylist.splice(from, 1);
  currentPlaylist.splice(to, 0, item);

  // Update currentIndex to follow the playing track
  if (currentIndex === from) {
    currentIndex = to;
  } else if (from < currentIndex && to >= currentIndex) {
    currentIndex--;
  } else if (from > currentIndex && to <= currentIndex) {
    currentIndex++;
  }

  renderPlaylist();
}

btnClearPlaylist.addEventListener("click", () => {
  stopPlayback();
  currentPlaylist.length = 0;
  renderPlaylist();
});

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
  window.api.trackPlayed(track.id);
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

btnMode.addEventListener("click", () => {
  autoAdvance = !autoAdvance;
  btnMode.textContent = autoAdvance ? "AUTO" : "MANUAL";
  btnMode.classList.toggle("active", autoAdvance);
});

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
  const trackDuration =
    isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : currentPlaylist[currentIndex]?.duration || 0;
  timeDisplay.textContent = `${formatTime(audio.currentTime)} / ${formatTime(trackDuration)}`;
  const pct = trackDuration ? (audio.currentTime / trackDuration) * 100 : 0;
  progressFill.style.width = pct + "%";
});

audio.addEventListener("ended", async () => {
  if (!autoAdvance) {
    btnPlay.innerHTML = "&#9654;";
    return;
  }
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

const pathSections: { type: ContentType; label: string }[] = [
  { type: "music", label: "Music" },
  { type: "commercial", label: "Commercials" },
  { type: "jingle", label: "Jingles" },
];

btnPaths.addEventListener("click", () => {
  renderPaths();
  pathsOverlay.classList.remove("hidden");
});

btnClosePaths.addEventListener("click", () => {
  pathsOverlay.classList.add("hidden");
});

async function renderPaths(): Promise<void> {
  const allPaths = await window.api.getAllPaths();
  pathsList.innerHTML = "";

  for (const { type, label } of pathSections) {
    const section = document.createElement("div");
    section.className = "path-section";

    const header = document.createElement("div");
    header.className = "path-section-header";
    header.innerHTML = `
      <span>${esc(label)}</span>
      <button class="btn-add-section" title="Add ${esc(label)} folder">+ Add</button>
    `;
    header
      .querySelector(".btn-add-section")!
      .addEventListener("click", async () => {
        const added = await window.api.addPath(type);
        if (added) renderPaths();
      });
    section.appendChild(header);

    const paths = allPaths[type] || [];
    if (paths.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty path-empty";
      empty.textContent = "No folders configured";
      section.appendChild(empty);
    } else {
      for (const p of paths) {
        const row = document.createElement("div");
        row.className = "path-row";
        row.innerHTML = `
          <span class="path-text">${esc(p)}</span>
          <button class="btn-remove" title="Remove">&#10005;</button>
        `;
        row
          .querySelector(".btn-remove")!
          .addEventListener("click", async () => {
            await window.api.removePath(type, p);
            renderPaths();
          });
        section.appendChild(row);
      }
    }

    pathsList.appendChild(section);
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
  if (!seconds || !isFinite(seconds)) return "0:00";
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
