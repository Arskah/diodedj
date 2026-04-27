<script lang="ts">
  import { app, formatTime } from "../state.svelte";

  const TOOLTIP_WIDTH = 280;
  const GAP = 8;

  let tooltip: HTMLDivElement | undefined = $state();
  let height = $state(0);

  $effect(() => {
    if (app.hoveredTrack && tooltip) {
      height = tooltip.offsetHeight;
    }
  });

  let left = $derived.by(() => {
    const x = app.hoverX + GAP;
    const max = window.innerWidth - TOOLTIP_WIDTH - GAP;
    if (x > max) return Math.max(GAP, app.hoverX - TOOLTIP_WIDTH - GAP);
    return x;
  });

  let top = $derived.by(() => {
    const max = window.innerHeight - height - GAP;
    return Math.min(Math.max(GAP, app.hoverY), max);
  });

  function formatRate(hz: number): string {
    return `${(hz / 1000).toFixed(1)} kHz`;
  }

  function formatBitrate(bps: number): string {
    return `${Math.round(bps / 1000)} kbps`;
  }
</script>

{#if app.hoveredTrack}
  {@const t = app.hoveredTrack}
  <div
    class="track-tooltip"
    bind:this={tooltip}
    style:left="{left}px"
    style:top="{top}px"
    style:width="{TOOLTIP_WIDTH}px"
    role="tooltip"
  >
    <div class="tt-title">{t.title}</div>
    <div class="tt-artist">{t.artist}</div>
    <dl class="tt-meta">
      <dt>Album</dt>
      <dd>{t.album}</dd>
      {#if t.genre}
        <dt>Genre</dt>
        <dd>{t.genre}</dd>
      {/if}
      {#if t.year}
        <dt>Year</dt>
        <dd>{t.year}</dd>
      {/if}
      <dt>Duration</dt>
      <dd>{formatTime(t.duration)}</dd>
      {#if t.bpm}
        <dt>BPM</dt>
        <dd>{t.bpm}</dd>
      {/if}
      {#if t.format}
        <dt>Format</dt>
        <dd>{t.format.toUpperCase()}</dd>
      {/if}
      {#if t.bitrate}
        <dt>Bitrate</dt>
        <dd>{formatBitrate(t.bitrate)}</dd>
      {/if}
      {#if t.sample_rate}
        <dt>Sample rate</dt>
        <dd>{formatRate(t.sample_rate)}</dd>
      {/if}
      <dt>Plays</dt>
      <dd>{t.play_count ?? 0}</dd>
    </dl>
  </div>
{/if}
