<script lang="ts">
  import { app } from "../../shared/state.svelte";

  async function openPaths(): Promise<void> {
    await app.loadPaths();
    app.pathsOpen = true;
  }
</script>

<header id="toolbar">
  <div id="toolbar-spacer"></div>
  <div id="toolbar-actions">
    <span id="library-stats">
      {#if app.stats && app.stats.totalTracks > 0}
        {app.stats.totalTracks} tracks | {app.stats.totalArtists} artists | {app
          .stats.totalHours}h
      {/if}
    </span>
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
  </div>
</header>
