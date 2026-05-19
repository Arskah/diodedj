# Now-playing broadcast

DiodeDJ can expose the currently playing track to external consumers via two
parallel sinks:

- **Webhook** — outbound HTTP POST on every track-start and stop.
- **File output** — `now_playing.txt` + `now_playing.json` written atomically
  to a configurable directory. OBS-friendly.

Both are configured from **Settings → Now Playing**. They can be enabled
independently and changes take effect immediately (no app restart).

Only the **main deck** triggers broadcasts. The cue/preview deck never
announces.

## Trigger semantics

A `now_playing` event fires when the main deck transitions to playing with
a different track than the one currently announced. A `stopped` event fires
on pause, on natural track-end, on explicit stop, and on app quit. Pausing
mid-track is reported as `stopped` because radio listeners hear silence
regardless of intent; resuming the same track fires a fresh `now_playing`.

A crash or SIGKILL cannot fire a final `stopped`. Consumers should treat
"no update in N minutes" as off-air.

## Webhook

```
POST <configured URL>
Content-Type: application/json
User-Agent: DiodeDJ/<version>
X-DiodeDJ-Signature: sha256=<lowercase hex>      (only if a secret is set)
```

Delivery is fire-and-forget with a 5-second timeout. Failures are logged
and dropped; no retry, no auto-disable. If a new event fires before the
previous request completes, the in-flight request is aborted.

### Payload — track start

```json
{
  "event": "now_playing",
  "track": {
    "id": 123,
    "title": "Song",
    "artist": "Artist",
    "album": "Album",
    "genre": "Rock",
    "durationSec": 245.3,
    "contentType": "music",
    "path": "/abs/path/file.mp3"
  },
  "startedAt": "2026-05-19T14:23:11.482Z"
}
```

### Payload — stop

```json
{ "event": "stopped", "stoppedAt": "2026-05-19T14:27:16.901Z" }
```

### Payload — test

The **Test webhook** button sends a synthetic event. Useful for verifying
connectivity without playing a track.

```json
{ "event": "test", "sentAt": "2026-05-19T14:23:11.482Z" }
```

### HMAC verification

If a webhook secret is set, requests carry an `X-DiodeDJ-Signature` header.
The signature is `sha256=` followed by the lowercase hex of
`HMAC-SHA256(secret, raw_body_bytes)` — identical scheme to GitHub webhooks.

Node example:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(secret, body, header) {
  const expected =
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}
```

### Dedupe guidance

A crash followed by app restart can replay a `now_playing` for the same
track (because the prior `stopped` was never delivered). Consumers should
dedupe by `startedAt` rather than `track.id` alone.

## File output

Two files are rewritten atomically (tmp + rename) in the configured
directory on every event:

- `now_playing.txt` — one line, `Artist - Title` (or just `Title` if the
  artist is empty). No trailing newline.
- `now_playing.json` — identical schema to the webhook payload.

On a `stopped` event both files are truncated to empty. OBS Text (GDI+)
sources should be pointed at `now_playing.txt` and configured to display
nothing while empty.

If no directory is set the files land in `<app-data-dir>/now-playing/`,
where `<app-data-dir>` resolves to:

- macOS: `~/Library/Application Support/com.diodedj.app/`
- Linux: `~/.local/share/com.diodedj.app/` (or
  `$XDG_DATA_HOME/com.diodedj.app/`)
- Windows: `%APPDATA%\com.diodedj.app\` (typically
  `C:\Users\<you>\AppData\Roaming\com.diodedj.app\`)

The same directory holds DiodeDJ's `config.json`, `session.json`, and
`diodedj.db`.
