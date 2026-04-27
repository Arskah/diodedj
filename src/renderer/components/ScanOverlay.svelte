<script lang="ts">
  import { app } from "../state.svelte";

  let status = $derived(
    app.scanTotal > 0
      ? `${app.scanProcessed} / ${app.scanTotal} files`
      : "Scanning...",
  );
  let pct = $derived(
    app.scanTotal > 0 ? (app.scanProcessed / app.scanTotal) * 100 : 0,
  );
</script>

<div id="scan-overlay" class:hidden={!app.scanOpen}>
  <div id="scan-modal">
    <h3>Scanning Library...</h3>
    <div id="scan-status">{status}</div>
    <div id="scan-bar-container">
      <div id="scan-bar-fill" style:width="{pct}%"></div>
    </div>
  </div>
</div>
