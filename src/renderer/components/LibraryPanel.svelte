<script lang="ts">
  import { app, formatTime, type Track } from "../state.svelte";
  import type { ContentType } from "../../types";

  const tabs: { type: ContentType; label: string }[] = [
    { type: "music", label: "Music" },
    { type: "commercial", label: "Commercials" },
    { type: "jingle", label: "Jingles" },
  ];

  function playNow(track: Track, e: MouseEvent): void {
    e.stopPropagation();
    app.playNow(track);
  }

  function add(track: Track, e: MouseEvent): void {
    e.stopPropagation();
    app.addToPlaylist(track);
  }
</script>

<section id="library-panel">
  <div id="library-tabs">
    {#each tabs as { type, label } (type)}
      <button
        class="lib-tab"
        class:active={app.activeTab === type}
        data-type={type}
        onclick={() => app.setTab(type)}
      >
        {label}
      </button>
    {/each}
  </div>
  <div id="track-list">
    {#if app.tracks.length === 0}
      <div class="empty">No tracks found</div>
    {:else}
      {#each app.tracks as track (track.id)}
        <div
          class="track-row"
          ondblclick={() => app.addToPlaylist(track)}
          role="button"
          tabindex="0"
        >
          <span class="track-title">{track.title}</span>
          <span class="track-artist">{track.artist}</span>
          <span class="track-album">{track.album}</span>
          <span class="track-plays">{track.play_count || 0}</span>
          <span class="track-duration">{formatTime(track.duration)}</span>
          <button
            class="btn-play-track"
            title="Add and play"
            onclick={(e) => playNow(track, e)}>&#9654;</button
          >
          <button
            class="btn-add"
            title="Add to playlist"
            onclick={(e) => add(track, e)}>+</button
          >
        </div>
      {/each}
    {/if}
  </div>
</section>
