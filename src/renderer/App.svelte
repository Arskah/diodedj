<script lang="ts">
  import Toolbar from "./components/Toolbar.svelte";
  import NowPlaying from "./components/NowPlaying.svelte";
  import LibraryPanel from "./components/LibraryPanel.svelte";
  import PlaylistPanel from "./components/PlaylistPanel.svelte";
  import PathsOverlay from "./components/PathsOverlay.svelte";
  import ScanOverlay from "./components/ScanOverlay.svelte";
</script>

<Toolbar />
<NowPlaying />
<main id="content">
  <LibraryPanel />
  <PlaylistPanel />
</main>
<PathsOverlay />
<ScanOverlay />
