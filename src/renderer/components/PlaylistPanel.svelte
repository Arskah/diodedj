<script lang="ts">
  import { app, formatTime } from "../state.svelte";

  let dragFromIndex = $state(-1);
  let dragOverIndex = $state(-1);

  function onDragStart(i: number): void {
    dragFromIndex = i;
  }

  function onDragEnd(): void {
    dragFromIndex = -1;
    dragOverIndex = -1;
  }

  function onDragOver(e: DragEvent, i: number): void {
    e.preventDefault();
    dragOverIndex = i;
  }

  function onDragLeave(i: number): void {
    if (dragOverIndex === i) dragOverIndex = -1;
  }

  function onDrop(e: DragEvent, i: number): void {
    e.preventDefault();
    dragOverIndex = -1;
    if (dragFromIndex === -1 || dragFromIndex === i) return;
    app.movePlaylistItem(dragFromIndex, i);
  }
</script>

<section id="playlist-panel">
  <div id="playlist-header">
    <h2>
      Playlist <span id="playlist-count">({app.playlist.length})</span>
    </h2>
    <button
      id="btn-clear-playlist"
      title="Clear playlist"
      onclick={() => app.clearPlaylist()}>Clear</button
    >
  </div>
  <div id="playlist">
    {#if app.playlist.length === 0}
      <div class="empty">Playlist empty</div>
    {:else}
      {#each app.playlist as track, i (i + "-" + track.id)}
        <div
          class="playlist-row"
          class:active={i === app.currentIndex}
          class:dragging={i === dragFromIndex}
          class:drag-over={i === dragOverIndex && i !== dragFromIndex}
          draggable="true"
          data-index={i}
          ondblclick={() => app.playIndex(i)}
          ondragstart={() => onDragStart(i)}
          ondragend={onDragEnd}
          ondragover={(e) => onDragOver(e, i)}
          ondragleave={() => onDragLeave(i)}
          ondrop={(e) => onDrop(e, i)}
          role="listitem"
        >
          <span class="pl-drag">&#8942;</span>
          <span class="pl-num">{i + 1}</span>
          <span class="pl-title">{track.title}</span>
          <span class="pl-artist">{track.artist}</span>
          <span class="pl-duration">{formatTime(track.duration)}</span>
          <button
            class="btn-remove"
            title="Remove"
            onclick={(e) => {
              e.stopPropagation();
              app.removeFromPlaylist(i);
            }}>&#10005;</button
          >
        </div>
      {/each}
    {/if}
  </div>
</section>
