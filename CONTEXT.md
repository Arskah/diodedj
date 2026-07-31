# RadiodioDJ

Desktop radio-station player: scans local audio, classifies tracks by content type, plays them on virtual DJ decks with auto-playlist scheduling that interleaves jingles and commercials between music.

## Language

### Library & content

**Track**:
A single audio file indexed in a library, with tag-derived metadata.
_Avoid_: Song, file, audio, item

**Content type**:
Closed enum classifying a track: `music`, `jingle`, or `commercial`. Determines which typed library owns it.
_Avoid_: Category, kind, tag

**Music library**:
Aggregate of all tracks with content type `music`.
_Avoid_: Songs, music collection

**Jingle library**:
Aggregate of all tracks with content type `jingle`.
_Avoid_: Sweepers, IDs, stings

**Commercial library**:
Aggregate of all tracks with content type `commercial`.
_Avoid_: Ads, spots

**Library path**:
A user-configured filesystem root the scanner recurses into. Feeds tracks into one or more typed libraries.
_Avoid_: Folder, source, watch dir

> "Library" alone is ambiguous — always qualify with the content type.

### Scan lifecycle

**Scan**:
Traversal of all library paths that upserts present tracks and prunes orphaned rows.
_Avoid_: Index, crawl, refresh

**Prune**:
Deletion of tracks whose file path no longer falls under any configured library path.
_Avoid_: Cleanup, gc, sweep

**Delta cache**:
mtime + content-type cache letting the scanner skip unchanged files.
_Avoid_: Cache, diff

**Scan progress**:
Event stream emitted by the scan worker with counts and current file.
_Avoid_: Status, update

### Decks & playback

**Deck**:
Independent playback channel; loads one track, plays, pauses, seeks. Modeled on a real-DJ rig.
_Avoid_: Player, channel, engine

**Main deck**:
The on-air deck. Its output is what listeners hear.
_Avoid_: Program deck, A deck

**Cue deck**:
Off-air deck used to preview/audition a track before promoting it to the main deck.
_Avoid_: Preview, monitor, B deck

**Now playing**:
The track currently loaded and playing on the Main deck.
_Avoid_: Current, active

**Cueing**:
Loading and inspecting a track on the cue deck without putting it on air.
_Avoid_: Previewing, scrubbing

**Seek**:
Reposition playback within the track loaded on a deck.
_Avoid_: Scrub, skip

### Playlist

**Playlist**:
Ordered sequence of upcoming tracks that feeds the Main deck.
_Avoid_: Queue, list

**Auto-playlist**:
Playlist mode that maintains itself by randomly selecting from the Music library with jingle/commercial interleaving.
_Avoid_: Auto-DJ, autoplay

**Lookahead buffer**:
The buffer of tracks the auto-playlist keeps ahead of Now playing. Target size is 20 tracks; refills when remaining tracks fall below a threshold of 5.
_Avoid_: Buffer, preload

**Interleave**:
Insertion of one Jingle library track every 4 music tracks and one Commercial library track every 8.
_Avoid_: Rotation, scheduling

### Persistence

**Config**:
Persisted `AppConfig` written to `{app_data_dir}/config.json`.
_Avoid_: Settings, prefs

**Session**:
Persisted `SessionState` written to `{app_data_dir}/session.json`.
_Avoid_: Restore state

**Flush save**:
Awaited write of session/config on window close.
_Avoid_: Persist, sync

## Relationships

- A **Library path** contributes **Tracks** to one or more typed libraries, selected by **Content type**
- Every **Track** belongs to exactly one of **Music library**, **Jingle library**, or **Commercial library**
- A **Playlist** feeds the **Main deck**; the **Cue deck** is fed by manual selection from any library
- An **Auto-playlist** draws music from the **Music library** and **Interleaves** jingles and commercials from their respective libraries
- An **Auto-playlist** keeps a **Lookahead buffer** ahead of **Now playing**
- Only music tracks advance the **Interleave** counters

## Example dialogue

> **Dev:** "When I drop a folder of station IDs into a **Library path**, does the **Auto-playlist** start using them?"
>
> **Domain expert:** "Only if they're tagged with content type `jingle`. The **Scan** sorts them into the **Jingle library**. The **Auto-playlist** then picks one every 4 music tracks via **Interleave**."
>
> **Dev:** "What if I want to preview a specific commercial before it airs?"
>
> **Domain expert:** "Load it on the **Cue deck**. **Cueing** lets you audition without affecting **Now playing** on the **Main deck**."
>
> **Dev:** "Can the **Cue deck** play tracks from the **Music library** too?"
>
> **Domain expert:** "Yes. A deck is content-type-agnostic. The library distinction only matters for **Interleave** selection in the **Auto-playlist**."
>
> **Dev:** "If a **Library path** is removed, what happens to **Now playing** if it points to a track from there?"
>
> **Domain expert:** "Playback continues — the **Main deck** holds the decoded source. The next **Auto-playlist** refill won't pick it because **Prune** removed it from the **Music library**."

## Flagged ambiguities

- "Library" alone is ambiguous → always qualify: **Music library** / **Jingle library** / **Commercial library**. The plain word survives only as a generic shorthand.
- "Library path" is filesystem input, not a library. Many-to-many with typed libraries (one path can feed all three; one library aggregates many paths).
- "Player" retired as a domain term → use **Deck**. "Player" remains an implementation detail (Rust worker driving a rodio Sink per deck).
- "Playlist" vs "Queue" → **Playlist** is canonical. Avoid "queue" to prevent confusion with **Lookahead buffer**.
- "Auto-playlist" is a mode of **Playlist**, not a separate concept.
- "Cue deck" is a Deck (not a UI label) — peer to **Main deck**, modeled on real-DJ two-deck rigs.
- "Content type" is a closed enum: `music | jingle | commercial`. New types require deliberate domain extension.
