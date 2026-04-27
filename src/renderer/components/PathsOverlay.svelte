<script lang="ts">
  import { app } from "../state.svelte";
  import type { ContentType } from "../../types";

  const sections: { type: ContentType; label: string }[] = [
    { type: "music", label: "Music" },
    { type: "commercial", label: "Commercials" },
    { type: "jingle", label: "Jingles" },
  ];
</script>

<div id="paths-overlay" class:hidden={!app.pathsOpen}>
  <div id="paths-modal">
    <h3>Library Paths</h3>
    <div id="paths-list">
      {#each sections as { type, label } (type)}
        <div class="path-section">
          <div class="path-section-header">
            <span>{label}</span>
            <button
              class="btn-add-section"
              title="Add {label} folder"
              onclick={() => app.addPath(type)}>+ Add</button
            >
          </div>
          {#if (app.paths[type] ?? []).length === 0}
            <div class="empty path-empty">No folders configured</div>
          {:else}
            {#each app.paths[type] as p (p)}
              <div class="path-row">
                <span class="path-text">{p}</span>
                <button
                  class="btn-remove"
                  title="Remove"
                  onclick={() => app.removePath(type, p)}>&#10005;</button
                >
              </div>
            {/each}
          {/if}
        </div>
      {/each}
    </div>
    <div id="paths-actions">
      <button id="btn-close-paths" onclick={() => (app.pathsOpen = false)}
        >Close</button
      >
    </div>
  </div>
</div>
