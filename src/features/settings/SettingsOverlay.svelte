<script lang="ts">
  import { api } from "../../shared/api";
  import { app } from "../../shared/state.svelte";
  import type {
    ContentType,
    DeviceInfo,
    DeviceRef,
    NowPlayingConfig,
  } from "../../shared/types";

  const sections: { type: ContentType; label: string }[] = [
    { type: "music", label: "Music" },
    { type: "commercial", label: "Commercials" },
    { type: "jingle", label: "Jingles" },
  ];

  type ActiveTab = "library" | "audio" | "now-playing";
  let activeTab = $state<ActiveTab>("library");
  let mainDeviceChanged = $state(false);
  let nowPlaying = $state<NowPlayingConfig>({
    webhookUrl: null,
    webhookSecret: null,
    fileDir: null,
    fileEnabled: true,
    webhookEnabled: true,
  });
  let testResult = $state<string | null>(null);
  let testing = $state(false);

  $effect(() => {
    if (app.settingsOpen) {
      void app.loadAudioConfig();
      void loadNowPlayingConfig();
      mainDeviceChanged = false;
    }
  });

  async function loadNowPlayingConfig(): Promise<void> {
    nowPlaying = await api.getNowPlayingConfig();
  }

  async function saveNowPlaying(): Promise<void> {
    await api.setNowPlayingConfig(nowPlaying);
  }

  async function pickFileDir(): Promise<void> {
    const dir = await api.pickDirectory();
    if (dir) {
      nowPlaying = { ...nowPlaying, fileDir: dir };
      await saveNowPlaying();
    }
  }

  function clearFileDir(): void {
    nowPlaying = { ...nowPlaying, fileDir: null };
    void saveNowPlaying();
  }

  async function runTestWebhook(): Promise<void> {
    testing = true;
    testResult = null;
    try {
      const status = await api.testNowPlayingWebhook();
      testResult = `HTTP ${status}`;
    } catch (e) {
      testResult = `Error: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      testing = false;
    }
  }

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
      <button
        class="settings-tab"
        class:active={activeTab === "now-playing"}
        role="tab"
        aria-selected={activeTab === "now-playing"}
        onclick={() => (activeTab = "now-playing")}>Now Playing</button
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
            id="btn-scan-now"
            class="btn-scan-now"
            title="Scan all configured paths"
            onclick={onScan}>Scan library</button
          >
        </div>
      </div>
    {:else if activeTab === "audio"}
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
    {:else}
      <div class="settings-section">
        <h4>Now Playing broadcast</h4>
        <p class="hint">
          Expose the currently playing track to external consumers via outbound
          webhook and/or local files. Both update on track-start and on stop.
        </p>

        <h5>Webhook</h5>
        <label class="np-toggle">
          <input
            type="checkbox"
            bind:checked={nowPlaying.webhookEnabled}
            onchange={saveNowPlaying}
          />
          Enable webhook
        </label>
        <div class="np-row">
          <label for="np-webhook-url">URL</label>
          <input
            id="np-webhook-url"
            type="url"
            placeholder="https://example.com/now-playing"
            value={nowPlaying.webhookUrl ?? ""}
            oninput={(e) =>
              (nowPlaying = {
                ...nowPlaying,
                webhookUrl: (e.currentTarget as HTMLInputElement).value || null,
              })}
            onchange={saveNowPlaying}
          />
        </div>
        <div class="np-row">
          <label for="np-webhook-secret">HMAC secret (optional)</label>
          <input
            id="np-webhook-secret"
            type="password"
            placeholder="leave blank for unsigned"
            value={nowPlaying.webhookSecret ?? ""}
            oninput={(e) =>
              (nowPlaying = {
                ...nowPlaying,
                webhookSecret:
                  (e.currentTarget as HTMLInputElement).value || null,
              })}
            onchange={saveNowPlaying}
          />
        </div>
        <div class="np-row">
          <button
            id="btn-np-test"
            onclick={runTestWebhook}
            disabled={testing || !nowPlaying.webhookUrl}>Test webhook</button
          >
          {#if testResult}
            <span class="np-test-result">{testResult}</span>
          {/if}
        </div>

        <h5>File output</h5>
        <label class="np-toggle">
          <input
            type="checkbox"
            bind:checked={nowPlaying.fileEnabled}
            onchange={saveNowPlaying}
          />
          Enable file output
        </label>
        <div class="np-row">
          <span>Directory</span>
          <span class="np-file-dir"
            >{nowPlaying.fileDir ?? "(app data dir / now-playing)"}</span
          >
          <button onclick={pickFileDir}>Pick folder</button>
          {#if nowPlaying.fileDir}
            <button onclick={clearFileDir}>Reset</button>
          {/if}
        </div>
        <p class="hint">
          Writes <code>now_playing.txt</code> and <code>now_playing.json</code>
          atomically. Both files are truncated on stop.
        </p>
      </div>
    {/if}

    <div id="settings-actions">
      <button id="btn-close-settings" onclick={() => (app.settingsOpen = false)}
        >Close</button
      >
    </div>
  </div>
</div>
