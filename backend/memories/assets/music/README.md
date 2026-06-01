# Memory video music assets

Background music used when rendering trip memory videos.

## Current catalog

The active catalog is tuned for a bright, energetic, fun travel-recap mood. The
backend chooses one **enabled** track at random at memory creation time; users
do not pick music in the create flow.

### Active set — Kevin MacLeod (incompetech.com), CC-BY 4.0

Attribution is required and is surfaced to listeners via the music summary
serializer (picker, viewer, share page).

| catalog key | file | source |
|-------------|------|--------|
| `life-of-riley` | `life-of-riley.mp3` | Kevin MacLeod - Life of Riley |
| `carefree` | `carefree.mp3` | Kevin MacLeod - Carefree |
| `wallpaper` | `wallpaper.mp3` | Kevin MacLeod - Wallpaper |
| `pixelland` | `pixelland.mp3` | Kevin MacLeod - Pixelland |
| `jaunty-gumption` | `jaunty-gumption.mp3` | Kevin MacLeod - Jaunty Gumption |
| `monkeys-spinning` | `monkeys-spinning-monkeys.mp3` | Kevin MacLeod - Monkeys Spinning Monkeys |
| `funkorama` | `funkorama.mp3` | Kevin MacLeod - Funkorama |

### Retired set — Komiku / Loyalty Freak Music, CC0 1.0

Disabled in `music_catalog.py` (`enabled=False`); files kept for provenance and
easy re-enabling.

| catalog key | file | source |
|-------------|------|--------|
| `sunrise-road` | `intro-adventure.ogg` | Komiku - Introduction to your adventure |
| `coastal-light` | `travel-horizon.mp3` | Komiku - Travel to the Horizon |
| `lantern-evening` | `open-road.mp3` | Komiku - The road we use to travel when we were kids |
| `the-adventure` | `the-adventure.ogg` | Komiku - The adventure |
| `arcade-adventure` | `arcade-adventure.mp3` | Komiku - Poupi Great Adventures: The Arcade Game |
| `victory` | `victory.mp3` | Komiku - Victory |
| `traveling-mind` | `traveling-in-your-mind.mp3` | Loyalty Freak Music - Traveling in your mind |

See `CREDITS.md` for source URLs and license provenance.

## How the render uses these files

`memory_video_rendering.render_memory_video` resolves each catalog track
(`music_catalog.py`) to a file here via `resolve_music_asset_path`:

- File present: the real track is used and looped to cover the slideshow.
- File missing: the catalog synth fallback is used so rendering still succeeds.

## Licensing rules

Putting an audio file in this repo redistributes it. Most "free music" sites let
you use a track inside a video but forbid redistributing the standalone file.
Those are not allowed here.

Allowed:

- CC0 1.0 / Public Domain: preferred. No attribution, redistribution OK.
- CC-BY 4.0: allowed only if attribution remains recorded here and visible to
  end users wherever listeners hear the music.

Not allowed:

- NC (non-commercial) licenses.
- ND (no-derivatives) licenses.
- Stock/content licenses that forbid standalone redistribution.

## Verification

Run this after changing the catalog or files:

```bash
cd backend/memories/assets/music
./verify_music.sh
```

The script checks each expected file exists, is decodable audio, is stereo, and
has a sane duration.
