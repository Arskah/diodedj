<script lang="ts">
  import { app, formatTime } from "../../shared/state.svelte";
  import Waveform from "./Waveform.svelte";

  let progressBar: HTMLDivElement | undefined = $state();
  let scrubbing = false;
  let hoverPct = $state<number | null>(null);

  function pctFromClientX(clientX: number): number {
    if (!progressBar) return 0;
    const rect = progressBar.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * 100;
  }

  function seekToClientX(clientX: number): void {
    app.cueSeekToPct(pctFromClientX(clientX) / 100);
  }

  function onPointerDown(e: PointerEvent): void {
    if (!progressBar) return;
    scrubbing = true;
    progressBar.setPointerCapture(e.pointerId);
    seekToClientX(e.clientX);
  }

  function onPointerMove(e: PointerEvent): void {
    hoverPct = pctFromClientX(e.clientX);
    if (scrubbing) seekToClientX(e.clientX);
  }

  function onPointerUp(e: PointerEvent): void {
    if (!progressBar) return;
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

{#if app.cueDevice !== null}
  <section
    id="cue-deck"
    class="deck inner-shadow-recessed"
    aria-label="Cue deck"
  >
    <div class="cue-info">
      <div class="cue-info-left">
        <div class="deck-head">
          <span class="material-symbols-outlined" aria-hidden="true"
            >headphones</span
          >
          <span class="deck-label">Cue Deck</span>
        </div>
        <div class="track-names">
          <span class="cue-title"
            >{app.cueTrack ? app.cueTrack.title : "No Track Loaded"}</span
          >
          <span class="cue-artist">{app.cueTrack?.artist ?? ""}</span>
        </div>
      </div>
      <div class="deck-header-controls">
        <div class="cue-controls">
          <button
            class="btn-cue-play"
            title={app.cueIsPlaying ? "Pause cue" : "Play cue"}
            aria-label={app.cueIsPlaying ? "Pause cue" : "Play cue"}
            disabled={!app.cueTrack}
            onclick={() => app.cueTogglePlay()}
          >
            <span class="material-symbols-outlined"
              >{app.cueIsPlaying ? "pause" : "play_arrow"}</span
            >
          </button>
          <button
            class="btn-cue-stop"
            title="Stop cue"
            aria-label="Stop cue"
            disabled={!app.cueTrack}
            onclick={() => app.cueStop()}
          >
            <span class="material-symbols-outlined">stop</span>
          </button>
          <button
            class="btn-cue-promote"
            title="Insert cue track as next-up in main playlist"
            aria-label="Promote cue track to main playlist"
            disabled={!app.cueTrack}
            onclick={() => app.promoteCueToMain()}
          >
            <span class="material-symbols-outlined">add</span>
          </button>
        </div>
        <div class="cue-volume-wrap">
          <span class="material-symbols-outlined" aria-hidden="true"
            >volume_up</span
          >
          <input
            type="range"
            class="cue-volume"
            min="0"
            max="1"
            step="0.01"
            value={app.cueVolume}
            title="Cue volume"
            oninput={(e) =>
              app.setCueVolume(
                parseFloat((e.currentTarget as HTMLInputElement).value),
              )}
          />
        </div>
      </div>
    </div>
    <div
      class="cue-progress-bar"
      bind:this={progressBar}
      role="slider"
      tabindex="0"
      aria-label="Cue seek"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(app.cueProgressPct)}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerCancel}
      onpointerleave={onPointerLeave}
    >
      <Waveform
        peaks={app.cueWaveform}
        progressPct={app.cueProgressPct}
        {hoverPct}
        id="cue"
      />
      <div class="cue-progress-fill" style:width="{app.cueProgressPct}%"></div>
      <span class="time-pill"
        >{formatTime(app.cueCurrentTime)} / {formatTime(app.cueDuration)}</span
      >
    </div>
    {#if app.cueError}
      <div class="cue-error" role="alert">
        {app.cueError}
      </div>
    {/if}
  </section>
{/if}
