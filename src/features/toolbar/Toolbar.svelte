<script lang="ts">
  import { app } from "../../shared/state.svelte";

  async function openSettings(): Promise<void> {
    await app.loadPaths();
    app.settingsOpen = true;
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
    <button
      id="btn-settings"
      title="Settings — library paths, audio devices, scan"
      aria-label="Settings"
      onclick={openSettings}>&#9881;</button
    >
    <button
      id="btn-generate"
      class:active={app.autoPlaylistActive}
      title="Generate random playlist"
      aria-pressed={app.autoPlaylistActive}
      onclick={() => app.toggleAutoPlaylist()}
    >
      Auto Playlist
    </button>
  </div>
</header>
