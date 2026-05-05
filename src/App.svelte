<script lang="ts">
  import Toolbar from "./features/toolbar/Toolbar.svelte";
  import NowPlaying from "./features/player/NowPlaying.svelte";
  import CueDeck from "./features/player/CueDeck.svelte";
  import LibraryPanel from "./features/library/LibraryPanel.svelte";
  import PlaylistPanel from "./features/playlist/PlaylistPanel.svelte";
  import SettingsOverlay from "./features/settings/SettingsOverlay.svelte";
  import ScanStatusBar from "./features/scan/ScanStatusBar.svelte";
  import TrackTooltip from "./features/track/TrackTooltip.svelte";
  import { app } from "./shared/state.svelte";
</script>

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
