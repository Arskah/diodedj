<script lang="ts">
  import { app } from "../../shared/state.svelte";

  const AUTO_HIDE_MS = 5000;

  let dismissed = $state(false);
  let visible = $state(false);

  $effect(() => {
    const s = app.scanStatus;
    if (s.status === "running") {
      dismissed = false;
      visible = true;
      return;
    }
    if (s.status === "idle" && s.lastResult === null) {
      visible = false;
      return;
    }
    if (dismissed) {
      visible = false;
      return;
    }
    visible = true;
    const t = setTimeout(() => {
      dismissed = true;
      visible = false;
    }, AUTO_HIDE_MS);
    return () => clearTimeout(t);
  });

  let pct = $derived.by(() => {
    const s = app.scanStatus;
    if (s.status === "running" && s.total > 0) {
      return Math.min(100, (s.processed / s.total) * 100);
    }
    return 0;
  });

  let label = $derived.by(() => {
    const s = app.scanStatus;
    if (s.status === "running") {
      return s.total > 0
        ? `Scanning library… ${s.processed} / ${s.total}`
        : "Scanning library…";
    }
    if (s.status === "canceled") {
      const detail = s.added > 0 ? `${s.added} new/updated` : "no changes";
      return `Scan canceled at ${s.processed} / ${s.total} — ${detail}`;
    }
    if (s.status === "error") {
      return `Scan failed: ${s.message}`;
    }
    if (s.status === "idle" && s.lastResult) {
      const { total, added } = s.lastResult;
      const detail = added > 0 ? `${added} new/updated` : "no changes";
      return `Scan complete — ${total} tracks (${detail})`;
    }
    return "";
  });

  function onCancel(): void {
    void app.cancelScan();
  }

  function onDismiss(): void {
    dismissed = true;
    visible = false;
  }
</script>

{#if visible}
  <div
    id="scan-status-bar"
    role="status"
    aria-live="polite"
    data-state={app.scanStatus.status}
  >
    <span class="scan-status-label">{label}</span>
    {#if app.scanStatus.status === "running"}
      <div class="scan-status-bar-track">
        <div class="scan-status-bar-fill" style:width="{pct}%"></div>
      </div>
      <button type="button" class="scan-status-cancel" onclick={onCancel}>
        Cancel
      </button>
    {:else}
      <button type="button" class="scan-status-cancel" onclick={onDismiss}>
        Dismiss
      </button>
    {/if}
  </div>
{/if}
