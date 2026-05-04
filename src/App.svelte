<script lang="ts">
  import Toolbar from "./features/toolbar/Toolbar.svelte";
  import NowPlaying from "./features/player/NowPlaying.svelte";
  import LibraryPanel from "./features/library/LibraryPanel.svelte";
  import PlaylistPanel from "./features/playlist/PlaylistPanel.svelte";
  import PathsOverlay from "./features/paths/PathsOverlay.svelte";
  import ScanStatusBar from "./features/scan/ScanStatusBar.svelte";
  import TrackTooltip from "./features/track/TrackTooltip.svelte";
</script>

<Toolbar />
<NowPlaying />
<main id="content">
  <LibraryPanel />
  <PlaylistPanel />
</main>
<PathsOverlay />
<ScanStatusBar />
<TrackTooltip />
