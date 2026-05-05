<script lang="ts">
  import { app } from "../../shared/state.svelte";
  import type { ContentType, DeviceInfo, DeviceRef } from "../../shared/types";

  const sections: { type: ContentType; label: string }[] = [
    { type: "music", label: "Music" },
    { type: "commercial", label: "Commercials" },
    { type: "jingle", label: "Jingles" },
  ];

  type ActiveTab = "library" | "audio";
  let activeTab = $state<ActiveTab>("library");
  let mainDeviceChanged = $state(false);

  $effect(() => {
    if (app.settingsOpen) {
      void app.loadAudioConfig();
      mainDeviceChanged = false;
    }
  });

  function deviceKey(d: DeviceInfo | DeviceRef | null): string {
    return d ? `${d.name}|${d.description}` : "";
  }

  function findDevice(key: string): DeviceInfo | null {
    return app.audioDevices.find((d) => deviceKey(d) === key) ?? null;
  }

  async function onMainDeviceChange(e: Event): Promise<void> {
    const key = (e.currentTarget as HTMLSelectElement).value;
    if (key === "") {
      await app.setMainDeviceConfig(null);
    } else {
      const d = findDevice(key);
      if (d)
        await app.setMainDeviceConfig({
          name: d.name,
          description: d.description,
        });
    }
    mainDeviceChanged = true;
  }

  async function onCueDeviceChange(e: Event): Promise<void> {
    const key = (e.currentTarget as HTMLSelectElement).value;
    if (key === "") {
      await app.setCueDeviceConfig(null);
    } else {
      const d = findDevice(key);
      if (d)
        await app.setCueDeviceConfig({
          name: d.name,
          description: d.description,
        });
    }
  }

  async function onScan(): Promise<void> {
    await app.scan();
    app.settingsOpen = false;
  }
</script>

<div id="settings-overlay" class:hidden={!app.settingsOpen}>
  <div id="settings-modal">
    <div id="settings-tabs" role="tablist">
      <button
        class="settings-tab"
        class:active={activeTab === "library"}
        role="tab"
        aria-selected={activeTab === "library"}
        onclick={() => (activeTab = "library")}>Library</button
      >
      <button
        class="settings-tab"
        class:active={activeTab === "audio"}
        role="tab"
        aria-selected={activeTab === "audio"}
        onclick={() => (activeTab = "audio")}>Audio</button
      >
    </div>

    {#if activeTab === "library"}
      <div class="settings-section">
        <h4>Library Paths</h4>
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
        <div class="settings-row">
          <button
            class="btn-scan-now"
            title="Scan all configured paths"
            onclick={onScan}>Scan library</button
          >
        </div>
      </div>
    {:else}
      <div class="settings-section">
        <h4>Audio devices</h4>
        {#if app.audioDevices.length === 0}
          <div class="empty">No output devices detected</div>
        {:else}
          <div class="device-row">
            <label for="main-device">Main output</label>
            <select
              id="main-device"
              value={deviceKey(app.mainDevice)}
              onchange={onMainDeviceChange}
            >
              <option value="">System default</option>
              {#each app.audioDevices as d (deviceKey(d))}
                <option value={deviceKey(d)}>
                  {d.description}{d.isDefault ? " (default)" : ""}
                </option>
              {/each}
            </select>
          </div>
          {#if mainDeviceChanged}
            <div class="hint">
              Restart required to apply main-device change.
            </div>
          {/if}

          <div class="device-row">
            <label for="cue-device">Cue (preview) output</label>
            <select
              id="cue-device"
              value={deviceKey(app.cueDevice)}
              onchange={onCueDeviceChange}
            >
              <option value="">Disabled</option>
              {#each app.audioDevices as d (deviceKey(d))}
                <option value={deviceKey(d)}>
                  {d.description}{d.isDefault ? " (default)" : ""}
                </option>
              {/each}
            </select>
          </div>
          <div class="hint">
            Pick a different device than main for headphone preview.
          </div>
        {/if}
      </div>
    {/if}

    <div id="settings-actions">
      <button id="btn-close-settings" onclick={() => (app.settingsOpen = false)}
        >Close</button
      >
    </div>
  </div>
</div>
