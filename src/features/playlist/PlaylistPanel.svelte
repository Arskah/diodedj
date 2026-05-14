<script lang="ts">
  import { app, formatTime, type Track } from "../../shared/state.svelte";

  let dragFromIndex = $state(-1);
  let dropTarget = $state(-1);

  function onEnter(track: Track, e: MouseEvent): void {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    app.setHover(track, rect);
  }

  function onDragStart(e: DragEvent, i: number): void {
    dragFromIndex = i;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(i));
    }
  }

  function onDragEnd(): void {
    dragFromIndex = -1;
    dropTarget = -1;
  }

  function rowDropTarget(e: DragEvent, i: number): number {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientY < rect.top + rect.height / 2 ? i : i + 1;
  }

  function onRowDragOver(e: DragEvent, i: number): void {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    dropTarget = rowDropTarget(e, i);
  }

  function onRowDrop(e: DragEvent, i: number): void {
    e.preventDefault();
    const target = rowDropTarget(e, i);
    const from = dragFromIndex;
    dropTarget = -1;
    dragFromIndex = -1;
    if (from === -1) return;
    const insertAt = target > from ? target - 1 : target;
    if (insertAt === from) return;
    app.movePlaylistItem(from, insertAt);
  }

  function onListDragOver(e: DragEvent): void {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (dropTarget === -1) dropTarget = app.playlist.length;
  }

  function onListDrop(e: DragEvent): void {
    e.preventDefault();
    const from = dragFromIndex;
    const target = dropTarget === -1 ? app.playlist.length : dropTarget;
    dropTarget = -1;
    dragFromIndex = -1;
    if (from === -1) return;
    const insertAt = target > from ? target - 1 : target;
    if (insertAt === from) return;
    app.movePlaylistItem(from, insertAt);
  }

  function onClear(): void {
    if (app.playlistTab === "queue") app.clearPlaylist();
    else app.clearHistory();
  }
</script>

<section id="playlist-panel">
  <div id="playlist-header">
    <div id="playlist-tabs" role="tablist">
      <button
        class="pl-tab"
        class:active={app.playlistTab === "queue"}
        role="tab"
        aria-selected={app.playlistTab === "queue"}
        onclick={() => (app.playlistTab = "queue")}
      >
        Up next <span class="pl-tab-count">({app.playlist.length})</span>
      </button>
      <button
        class="pl-tab"
        class:active={app.playlistTab === "history"}
        role="tab"
        aria-selected={app.playlistTab === "history"}
        onclick={() => (app.playlistTab = "history")}
      >
        History <span class="pl-tab-count">({app.history.length})</span>
      </button>
    </div>
    <div id="playlist-actions">
      {#if app.playlistTab === "queue"}
        <button
          class="btn-filler"
          title="Add a jingle to the queue"
          disabled={(app.stats?.tracksByType.jingle ?? 0) === 0}
          onclick={() => app.addFiller("jingle")}>+ Jingle</button
        >
        <button
          class="btn-filler"
          title="Add a commercial to the queue"
          disabled={(app.stats?.tracksByType.commercial ?? 0) === 0}
          onclick={() => app.addFiller("commercial")}>+ Commercial</button
        >
      {/if}
      <button
        id="btn-clear-playlist"
        title={app.playlistTab === "queue" ? "Clear queue" : "Clear history"}
        onclick={onClear}>Clear</button
      >
    </div>
  </div>

  {#if app.playlistTab === "queue"}
    <div
      id="playlist"
      ondragover={onListDragOver}
      ondrop={onListDrop}
      role="list"
    >
      {#if app.playlist.length === 0}
        <div class="empty">Playlist empty</div>
      {:else}
        {#each app.playlist as track, i (i + "-" + track.id)}
          <div
            class="playlist-row"
            class:dragging={i === dragFromIndex}
            class:drop-before={dragFromIndex !== -1 && dropTarget === i}
            class:drop-after={dragFromIndex !== -1 &&
              dropTarget === i + 1 &&
              i === app.playlist.length - 1}
            draggable="true"
            data-index={i}
            ondblclick={() => app.playIndex(i)}
            ondragstart={(e) => onDragStart(e, i)}
            ondragend={onDragEnd}
            ondragover={(e) => onRowDragOver(e, i)}
            ondrop={(e) => onRowDrop(e, i)}
            onmouseenter={(e) => onEnter(track, e)}
            onmouseleave={() => app.clearHover()}
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
  {:else}
    <div id="history">
      {#if app.historyDisplay.length === 0}
        <div class="empty">History empty</div>
      {:else}
        {#each app.historyDisplay as track, i (i + "-" + track.id)}
          <div
            class="playlist-row history-row"
            data-index={i}
            ondblclick={() => app.requeueFromHistory(i)}
            onmouseenter={(e) => onEnter(track, e)}
            onmouseleave={() => app.clearHover()}
            role="listitem"
          >
            <span class="pl-num">{i + 1}</span>
            <span class="pl-title">{track.title}</span>
            <span class="pl-artist">{track.artist}</span>
            <span class="pl-duration">{formatTime(track.duration)}</span>
            <button
              class="btn-remove"
              title="Remove from history"
              onclick={(e) => {
                e.stopPropagation();
                app.removeFromHistory(i);
              }}>&#10005;</button
            >
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</section>
