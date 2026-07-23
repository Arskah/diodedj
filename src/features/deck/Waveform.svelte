<script lang="ts">
  /**
   * Amplitude-curve overlay for a deck seek bar. The stored peak curve is
   * symmetric, so only the top half is drawn: bars rise from the bar's baseline,
   * giving the DJ a visual map of song structure to seek against. A dim layer
   * covers the whole track; an accent layer clipped to the played portion tracks
   * the playhead.
   *
   * Bars are drawn once per track (they depend only on `peaks`); only the clip
   * width tracks `progressPct` as playback advances, so the 100 ms time tick
   * stays cheap. `height`/`width` are pinned to 100% so the SVG fills its bar
   * instead of falling back to the viewBox's intrinsic aspect ratio.
   */
  interface Props {
    peaks: number[] | null;
    progressPct: number;
    /** Unique per instance — clipPath ids must not collide across decks. */
    id: string;
  }

  const { peaks, progressPct, id }: Props = $props();

  // viewBox units: one x-unit per bucket, 0..100 vertical (bars grow up from the
  // baseline at y=100). preserveAspectRatio "none" stretches the grid to the
  // bar's real pixel size.
  const HEIGHT = 100;
  const MIN_BAR = 3; // keep silent buckets visible as a thin baseline

  const count = $derived(peaks?.length ?? 0);
  const bars = $derived(
    (peaks ?? []).map((v, i) => {
      const h = Math.max(MIN_BAR, (v / 255) * HEIGHT);
      return { x: i, y: HEIGHT - h, h };
    }),
  );
  const playedWidth = $derived(
    (Math.min(100, Math.max(0, progressPct)) / 100) * count,
  );
  const clipId = $derived(`wf-clip-${id}`);
</script>

{#if peaks && peaks.length > 0}
  <svg
    class="waveform"
    viewBox="0 0 {count} {HEIGHT}"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <defs>
      <clipPath id={clipId}>
        <rect x="0" y="0" width={playedWidth} height={HEIGHT} />
      </clipPath>
    </defs>
    <g class="wf-base">
      {#each bars as b (b.x)}
        <rect x={b.x + 0.1} y={b.y} width="0.8" height={b.h} />
      {/each}
    </g>
    <g class="wf-played" clip-path="url(#{clipId})">
      {#each bars as b (b.x)}
        <rect x={b.x + 0.1} y={b.y} width="0.8" height={b.h} />
      {/each}
    </g>
  </svg>
{/if}
