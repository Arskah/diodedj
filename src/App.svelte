<script lang="ts">
  import Toolbar from "./features/toolbar/Toolbar.svelte";
  import NowPlaying from "./features/deck/NowPlaying.svelte";
  import CueDeck from "./features/deck/CueDeck.svelte";
  import LibraryPanel from "./features/library/LibraryPanel.svelte";
  import PlaylistPanel from "./features/playlist/PlaylistPanel.svelte";
  import SettingsOverlay from "./features/settings/SettingsOverlay.svelte";
  import ScanStatusBar from "./features/scan/ScanStatusBar.svelte";
  import TrackTooltip from "./features/track/TrackTooltip.svelte";
  import ErrorBanner from "./features/ui/ErrorBanner.svelte";
  import { app } from "./shared/state.svelte";
</script>

{#if app.outputUnavailable || app.cueOutputUnavailable || app.reconnecting}
  <div id="network-toast">
    {#if app.outputUnavailable}
      <ErrorBanner
        message="Audio output unavailable — retrying…"
        type="error"
      />
    {/if}
    {#if app.cueOutputUnavailable}
      <ErrorBanner message="Cue output unavailable — retrying…" type="error" />
    {/if}
    {#if app.reconnecting}
      <ErrorBanner message="Reconnecting…" type="warning" />
    {/if}
  </div>
{/if}

<Toolbar />
<div id="deck-row" class:has-cue={app.cueDevice !== null}>
  <NowPlaying />
  <CueDeck />
</div>
<main id="content">
  <LibraryPanel />
  <PlaylistPanel />
</main>
<SettingsOverlay />
<ScanStatusBar />
<TrackTooltip />

<style>
  /* Floating toast: fixed so reconnect state never shifts deck layout mid-set. */
  #network-toast {
    position: fixed;
    top: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: center;
  }
</style>
