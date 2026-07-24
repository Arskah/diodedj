<script lang="ts">
  import { app, formatTime } from "../../shared/state.svelte";
  import Waveform from "./Waveform.svelte";

  let progressBar: HTMLDivElement;
  let scrubbing = false;
  let hoverPct = $state<number | null>(null);

  function pctFromClientX(clientX: number): number {
    const rect = progressBar.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * 100;
  }

  function seekToClientX(clientX: number): void {
    app.seekToPct(pctFromClientX(clientX) / 100);
  }

  function onPointerDown(e: PointerEvent): void {
    scrubbing = true;
    progressBar.setPointerCapture(e.pointerId);
    seekToClientX(e.clientX);
  }

  function onPointerMove(e: PointerEvent): void {
    hoverPct = pctFromClientX(e.clientX);
    if (scrubbing) seekToClientX(e.clientX);
  }

  function onPointerUp(e: PointerEvent): void {
    scrubbing = false;
    progressBar.releasePointerCapture(e.pointerId);
  }

  function onPointerCancel(): void {
    scrubbing = false;
    hoverPct = null;
  }

  function onPointerLeave(): void {
    hoverPct = null;
  }
</script>

<section id="now-playing">
  <div id="player-info">
    <div id="track-info">
      <span id="np-title"
        >{app.currentTrack ? app.currentTrack.title : "No track loaded"}</span
      >
      <span id="np-artist">{app.currentTrack?.artist ?? ""}</span>
      {#if app.isBuffering}
        <!-- Shimmer on the progress bar is the visual cue; keep a
             screen-reader-only announcement since CSS is invisible to AT. -->
        <span class="sr-only" aria-live="polite">Buffering…</span>
      {/if}
    </div>
    <div id="player-controls">
      <button
        id="btn-prev"
        title="Previous"
        aria-label="Previous track"
        onclick={() => app.prev()}>&#9198;</button
      >
      <button
        id="btn-play"
        title={app.isPlaying ? "Pause" : "Play"}
        aria-label={app.isPlaying ? "Pause" : "Play"}
        aria-pressed={app.isPlaying}
        onclick={() => app.togglePlay()}
      >
        {@html app.isPlaying ? "&#9208;" : "&#9654;"}
      </button>
      <button
        id="btn-stop"
        title="Stop"
        aria-label="Stop"
        onclick={() => app.stop()}>&#9632;</button
      >
      <button
        id="btn-next"
        title="Next"
        aria-label="Next track"
        onclick={() => app.next()}>&#9197;</button
      >
    </div>
    <button
      id="btn-mode"
      class:active={app.autoAdvance}
      title="Auto/Manual playback mode"
      aria-label="Toggle playback mode"
      aria-pressed={app.autoAdvance}
      onclick={() => app.toggleMode()}
    >
      {app.autoAdvance ? "AUTO" : "MANUAL"}
    </button>
    <div id="player-right">
      <span id="time-display"
        >{formatTime(app.currentTime)} / {formatTime(app.duration)}</span
      >
      <input
        type="range"
        id="volume"
        min="0"
        max="1"
        step="0.01"
        value={app.volume}
        title="Volume"
        oninput={(e) =>
          app.setVolume(
            parseFloat((e.currentTarget as HTMLInputElement).value),
          )}
      />
    </div>
  </div>
  <div
    id="progress-bar"
    class:buffering={app.isBuffering}
    bind:this={progressBar}
    role="slider"
    tabindex="0"
    aria-label="Seek"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(app.progressPct)}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerCancel}
    onpointerleave={onPointerLeave}
  >
    <Waveform
      peaks={app.waveform}
      progressPct={app.progressPct}
      {hoverPct}
      id="main"
    />
    <div id="progress-fill" style:width="{app.progressPct}%"></div>
  </div>
</section>
