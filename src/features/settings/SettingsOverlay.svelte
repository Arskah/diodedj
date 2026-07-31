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
  let showSecret = $state(false);

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
    <div id="settings-modal-header">
      <span class="settings-modal-title">
        <span class="material-symbols-outlined" aria-hidden="true"
          >settings</span
        >
        Preferences
      </span>
      <button
        id="btn-close-settings-x"
        title="Close"
        aria-label="Close settings"
        onclick={() => (app.settingsOpen = false)}
      >
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>

    <div id="settings-body">
      <div id="settings-sidebar" role="tablist" aria-label="Settings sections">
        <button
          class="settings-tab"
          class:active={activeTab === "audio"}
          role="tab"
          aria-selected={activeTab === "audio"}
          onclick={() => (activeTab = "audio")}
        >
          <span class="material-symbols-outlined">volume_up</span>
          Audio Output
        </button>
        <button
          class="settings-tab"
          class:active={activeTab === "library"}
          role="tab"
          aria-selected={activeTab === "library"}
          onclick={() => (activeTab = "library")}
        >
          <span class="material-symbols-outlined">sync</span>
          Library Sync
        </button>
        <button
          class="settings-tab"
          class:active={activeTab === "now-playing"}
          role="tab"
          aria-selected={activeTab === "now-playing"}
          onclick={() => (activeTab = "now-playing")}
        >
          <span class="material-symbols-outlined">rss_feed</span>
          Now Playing
        </button>
      </div>

      <div id="settings-content">
        {#if activeTab === "audio"}
          <div class="settings-section">
            <h4>Audio Configuration</h4>
            <p class="settings-section-desc">
              Configure your signal chain for low-latency broadcast performance.
            </p>
            {#if app.audioDevices.length === 0}
              <div class="empty">
                <span class="empty-icon"
                  ><span class="material-symbols-outlined">volume_off</span
                  ></span
                >
                <span class="empty-title">No Output Devices</span>
                <span class="empty-body"
                  >No audio output devices were detected on this system.</span
                >
              </div>
            {:else}
              <div class="device-row">
                <label for="main-device">Master Output Device</label>
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
                {#if mainDeviceChanged}
                  <div class="hint">
                    Restart required to apply main-device change.
                  </div>
                {/if}
              </div>

              <div class="device-row">
                <label for="cue-device">Cue / Headphones Output</label>
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
                <div class="hint">
                  Pick a different device than main for headphone preview.
                </div>
              </div>
            {/if}
          </div>
        {:else if activeTab === "library"}
          <div class="settings-section">
            <h4>Library Synchronization</h4>
            <p class="settings-section-desc">
              Configure directory paths and automatic scanning for your media
              assets.
            </p>
            <div id="paths-list">
              {#each sections as { type, label } (type)}
                <div class="path-section">
                  <div class="path-section-header">
                    <span>{label}</span>
                    <button
                      class="btn-add-section"
                      title="Add {label} folder"
                      onclick={() => app.addPath(type)}
                    >
                      <span class="material-symbols-outlined">add_circle</span>
                      Add Directory
                    </button>
                  </div>
                  {#if (app.libraryPaths[type] ?? []).length === 0}
                    <div class="path-empty">
                      No {label.toLowerCase()} directories defined. Click "Add Directory"
                      to begin.
                    </div>
                  {:else}
                    {#each app.libraryPaths[type] as p (p)}
                      <div class="path-row">
                        <span class="material-symbols-outlined">folder</span>
                        <span class="path-text">{p}</span>
                        <button
                          class="btn-remove"
                          title="Remove"
                          aria-label="Remove directory"
                          onclick={() => app.removePath(type, p)}
                        >
                          <span class="material-symbols-outlined">close</span>
                        </button>
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
                onclick={onScan}
              >
                <span class="material-symbols-outlined">sync</span>
                Scan Library Now
              </button>
            </div>
          </div>
        {:else}
          <div class="settings-section">
            <h4>Now Playing Metadata</h4>
            <p class="settings-section-desc">
              Expose the currently playing track to external consumers via
              outbound webhook and/or local files. Updates fire on track-start
              and on stop.
            </p>

            <div class="np-group" class:disabled={!nowPlaying.webhookEnabled}>
              <div class="np-group-header">
                <span class="material-symbols-outlined" aria-hidden="true"
                  >webhook</span
                >
                <span class="np-group-title">Webhook Export</span>
                <label class="np-toggle" title="Enable webhook export">
                  <input
                    type="checkbox"
                    bind:checked={nowPlaying.webhookEnabled}
                    onchange={saveNowPlaying}
                  />
                  <span class="np-toggle-track"></span>
                </label>
              </div>
              <div class="np-field">
                <label class="np-field-label" for="np-webhook-url"
                  >Target URL</label
                >
                <div class="np-input-wrap">
                  <span class="material-symbols-outlined">link</span>
                  <input
                    id="np-webhook-url"
                    class="np-input"
                    type="url"
                    placeholder="https://example.com/now-playing"
                    value={nowPlaying.webhookUrl ?? ""}
                    oninput={(e) =>
                      (nowPlaying = {
                        ...nowPlaying,
                        webhookUrl:
                          (e.currentTarget as HTMLInputElement).value || null,
                      })}
                    onchange={saveNowPlaying}
                  />
                </div>
              </div>
              <div class="np-field">
                <label class="np-field-label" for="np-webhook-secret"
                  >HMAC Secret (optional)</label
                >
                <div class="np-input-wrap">
                  <span class="material-symbols-outlined">key</span>
                  <input
                    id="np-webhook-secret"
                    class="np-input mono"
                    type={showSecret ? "text" : "password"}
                    placeholder="optional"
                    value={nowPlaying.webhookSecret ?? ""}
                    oninput={(e) =>
                      (nowPlaying = {
                        ...nowPlaying,
                        webhookSecret:
                          (e.currentTarget as HTMLInputElement).value || null,
                      })}
                    onchange={saveNowPlaying}
                  />
                  <button
                    type="button"
                    class="np-eye"
                    title={showSecret ? "Hide secret" : "Show secret"}
                    aria-label={showSecret ? "Hide secret" : "Show secret"}
                    onclick={() => (showSecret = !showSecret)}
                  >
                    <span class="material-symbols-outlined"
                      >{showSecret ? "visibility_off" : "visibility"}</span
                    >
                  </button>
                </div>
              </div>
              <div class="np-action-row">
                <button
                  class="btn-scan-now"
                  onclick={runTestWebhook}
                  disabled={testing || !nowPlaying.webhookUrl}
                  >{testing ? "Testing…" : "Test webhook"}</button
                >
                {#if testResult}
                  <span class="np-test-result">{testResult}</span>
                {/if}
              </div>
            </div>

            <div class="np-group" class:disabled={!nowPlaying.fileEnabled}>
              <div class="np-group-header">
                <span class="material-symbols-outlined" aria-hidden="true"
                  >save</span
                >
                <span class="np-group-title">Local File Export</span>
                <label class="np-toggle" title="Enable file export">
                  <input
                    type="checkbox"
                    bind:checked={nowPlaying.fileEnabled}
                    onchange={saveNowPlaying}
                  />
                  <span class="np-toggle-track"></span>
                </label>
              </div>
              <div class="np-field">
                <label class="np-field-label" for="np-file-dir"
                  >Export Directory</label
                >
                <div class="np-input-wrap">
                  <span class="material-symbols-outlined">folder_open</span>
                  <span id="np-file-dir" class="np-file-dir"
                    >{nowPlaying.fileDir ??
                      "(app data dir / now-playing)"}</span
                  >
                  <button class="np-browse" onclick={pickFileDir}>
                    <span class="material-symbols-outlined">search</span>
                    Browse
                  </button>
                  {#if nowPlaying.fileDir}
                    <button class="np-browse" onclick={clearFileDir}
                      >Reset</button
                    >
                  {/if}
                </div>
              </div>
              <div class="np-file-hint">
                Writes <code>now_playing.txt</code> and
                <code>now_playing.json</code> atomically. TXT is truncated on stop;
                JSON keeps the Stopped event payload.
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <div id="settings-footer">
      <span class="settings-footer-info">
        <span class="material-symbols-outlined" aria-hidden="true">info</span>
        All changes are saved automatically
      </span>
      <div id="settings-actions">
        <button
          id="btn-close-settings"
          onclick={() => (app.settingsOpen = false)}>Close</button
        >
      </div>
    </div>
  </div>
</div>
