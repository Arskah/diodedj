<script lang="ts">
  import { app, formatTime } from "../../shared/state.svelte";

  let progressBar: HTMLDivElement | undefined = $state();
  let scrubbing = false;

  function seekToClientX(clientX: number): void {
    if (!progressBar) return;
    const rect = progressBar.getBoundingClientRect();
    const pct = (clientX - rect.left) / rect.width;
    app.cueSeekToPct(pct);
  }

  function onPointerDown(e: PointerEvent): void {
    if (!progressBar) return;
    scrubbing = true;
    progressBar.setPointerCapture(e.pointerId);
    seekToClientX(e.clientX);
  }

  function onPointerMove(e: PointerEvent): void {
    if (scrubbing) seekToClientX(e.clientX);
  }

  function onPointerUp(e: PointerEvent): void {
    if (!progressBar) return;
    scrubbing = false;
    progressBar.releasePointerCapture(e.pointerId);
  }

  function onPointerCancel(): void {
    scrubbing = false;
  }
</script>

{#if app.cueDevice !== null}
  <section id="cue-deck" aria-label="Cue deck">
    <div class="cue-info">
      <div class="cue-track-info">
        <span class="cue-title"
          >{app.cueTrack ? app.cueTrack.title : "Cue idle"}</span
        >
        <span class="cue-artist">{app.cueTrack?.artist ?? ""}</span>
      </div>
      <div class="cue-controls">
        <button
          class="btn-cue-play"
          title={app.cueIsPlaying ? "Pause cue" : "Play cue"}
          disabled={!app.cueTrack}
          onclick={() => app.cueTogglePlay()}
        >
          {@html app.cueIsPlaying ? "&#9208;" : "&#9654;"}
        </button>
        <button
          class="btn-cue-stop"
          title="Stop cue"
          disabled={!app.cueTrack}
          onclick={() => app.cueStop()}>&#9632;</button
        >
        <button
          class="btn-cue-promote"
          title="Insert cue track as next-up in main playlist"
          disabled={!app.cueTrack}
          onclick={() => app.promoteCueToMain()}>&rarr; main</button
        >
      </div>
      <div class="cue-right">
        <span class="cue-time-display"
          >{formatTime(app.cueCurrentTime)} / {formatTime(
            app.cueDuration,
          )}</span
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
    >
      <div class="cue-progress-fill" style:width="{app.cueProgressPct}%"></div>
    </div>
    {#if app.cueError}
      <div class="cue-error" role="alert">
        {app.cueError}
      </div>
    {/if}
  </section>
{/if}
