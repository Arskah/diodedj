<script lang="ts">
  import { app } from "../state.svelte";

  let searchTimeout: number | undefined;

  function onInput(): void {
    clearTimeout(searchTimeout);
    searchTimeout = window.setTimeout(() => app.search(), 250);
  }

  async function openPaths(): Promise<void> {
    await app.loadPaths();
    app.pathsOpen = true;
  }
</script>

<header id="toolbar">
  <div id="search-area">
    <input
      type="text"
      id="search-input"
      placeholder="Search tracks..."
      autocomplete="off"
      bind:value={app.searchQuery}
      oninput={onInput}
    />
  </div>
  <div id="toolbar-actions">
    <button id="btn-paths" title="Manage library paths" onclick={openPaths}
      >Paths</button
    >
    <button
      id="btn-scan"
      title="Rescan all library paths"
      onclick={() => app.scan()}>Scan</button
    >
    <button
      id="btn-generate"
      class:active={app.autoPlaylistActive}
      title="Generate random playlist"
      onclick={() => app.toggleAutoPlaylist()}
    >
      Auto Playlist
    </button>
    <span id="library-stats">
      {#if app.stats && app.stats.totalTracks > 0}
        {app.stats.totalTracks} tracks | {app.stats.totalArtists} artists | {app
          .stats.totalHours}h
      {/if}
    </span>
  </div>
</header>
