# Memory video music assets

Background-music tracks used when rendering trip memory videos.

## How the render uses these files

`memory_video_rendering.render_memory_video` resolves each catalog track
(`music_catalog.py`) to a file here via `resolve_music_asset_path`:

- **File present** → the real track is used (looped to cover the slideshow).
- **File missing** → a synthesized tone is used as a fallback, so the video
  still has audio. The synth is a stopgap, not real music — add the files below
  to ship proper audio.

Expected filenames (drop files with EXACTLY these names):

| catalog key       | filename              |
|-------------------|-----------------------|
| `sunrise-road`    | `sunrise-road.mp3`    |
| `coastal-light`   | `coastal-light.mp3`   |
| `lantern-evening` | `lantern-evening.mp3` |

Recommended encoding: MP3 (or M4A/AAC), 48 kHz, stereo, ~2–4 min, 128–192 kbps.
The renderer loops the track, so a 2-min file is enough.

## ⚠️ Licensing — read before adding any file

Putting an audio file in this repo **redistributes** it. Most "free music"
sites (Pixabay, Mixkit, Bensound, Uppbeat, YouTube Audio Library) let you *use*
a track inside a video but **forbid redistributing the standalone file** — those
are NOT allowed here.

Only use a license that permits redistributing the file:

- **CC0 1.0 / Public Domain** — preferred. No attribution, redistribution OK.
- **CC-BY 4.0** — allowed, but you MUST keep attribution: record it in
  `CREDITS.md` AND show it to end users (e.g. on the share page).

Do NOT add NC (non-commercial) or "no redistribution" tracks.

## Setup — pick ONE route

### Route A — CC0, simplest (recommended)

CC0 needs no attribution, so you can rename the files freely and skip
`CREDITS.md` entirely. Downloading in the browser is the most reliable way —
no guessing direct URLs.

1. Open a CC0 source and pick 3 calm/cinematic instrumental tracks. These
   artists release **everything** under CC0 — safe to grab any track:
   - **Komiku** (FMA): https://freemusicarchive.org/music/Komiku/
   - **Monplaisir** (FMA): https://freemusicarchive.org/music/Monplaisir/
   - **Loyalty Freak Music** (FMA): https://freemusicarchive.org/music/Loyalty_Freak_Music/
   Other CC0 pools (verify each track's badge says **CC0 / Public Domain**):
   - Chosic, "No attribution" filter: https://www.chosic.com/free-music/all/?attribution=no
   - Wikimedia Commons, CC-Zero audio: https://commons.wikimedia.org/wiki/Category:CC-Zero
2. Download the 3 files, rename them to `sunrise-road.mp3`, `coastal-light.mp3`,
   `lantern-evening.mp3`, and drop them in THIS folder.
3. Verify: `./verify_music.sh` (it rejects anything that is not real,
   decodable, stereo audio of sane length).

### Route B — CC-BY (e.g. Kevin MacLeod / incompetech)

High quality and very stable, but attribution is mandatory — you must show the
credit to end users, not just keep it in `CREDITS.md` (this needs a small UI
addition on the memory/share page). Prefer Route A unless you specifically want
these tracks.

Good calm picks:
- **Kevin MacLeod** (incompetech.com): "Dreamer", "Almost in F - Tranquillity",
  "Lightless Dawn". Browse: https://incompetech.com/music/royalty-free/
- **Scott Buckley** (scottbuckley.com.au): "Reverie", "Moonlight", "Snowfall".
  All CC BY 4.0, with clean per-track download buttons.

Steps:
1. Fastest: run `./download_incompetech.sh`. It resolves 3 calm Kevin MacLeod
   tracks from the Internet Archive mirror, installs them under the 3 filenames,
   validates them, and prints a ready-to-paste `CREDITS.md` block.
   (Or pick tracks manually from an artist above, download in the browser, and
   rename to the filenames; or put direct URLs into `download_music.sh`.)
2. Paste the printed block into `CREDITS.md`.
3. Make sure the attribution is shown to end users on the memory/share page
   (CC BY 4.0 requires this — not just the file).
4. Verify: `./verify_music.sh`

## Scripts in this folder

- `download_incompetech.sh` — one-command CC BY 4.0 install from the Internet
  Archive mirror (auto-resolves calm tracks, validates, prints credits block).
- `download_music.sh` — paste direct URLs, it downloads + auto-rejects bad files.
- `verify_music.sh` — checks each expected file is real, decodable, stereo audio
  of sane length. Run it after adding files; run it before committing.

Until real files are added, renders use the synth fallback automatically — the
feature works either way.
