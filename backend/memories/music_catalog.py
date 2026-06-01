from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

# Bundled CC0 music assets live next to this module so renders are deterministic
# and do not depend on network access. Drop real CC0 tracks here (see
# assets/music/README.md) and reference them via ``asset_filename``.
MUSIC_ASSET_DIR = Path(__file__).resolve().parent / "assets" / "music"


@dataclass(frozen=True)
class MemoryMusicTrack:
    key: str
    title: str
    artist: str
    enabled: bool = True
    placeholder: bool = False
    # Filename of a bundled audio asset under MUSIC_ASSET_DIR. When present and
    # the file exists, the render uses the real track.
    asset_filename: str = ""
    # FFmpeg lavfi source used as a fallback when the bundled asset is missing,
    # so a freshly cloned repo still produces audible memory videos.
    ffmpeg_audio_filter: str = ""
    # Provenance for the bundled asset. Required for attribution-bearing
    # licenses and useful for future catalog audits. Empty for synth fallback.
    license: str = ""
    license_url: str = ""
    source_url: str = ""


# Keeping source URLs + license data here makes future license audits cheap.
# Two license families are allowed (see assets/music/README.md):
#   - CC0 1.0: public domain, no attribution required.
#   - CC-BY 4.0: free to use/redistribute as long as attribution is recorded
#     here and surfaced to listeners (the serializer exposes title/artist/
#     license so the picker, viewer, and share page can credit the author).
_CC0_1_0 = "CC0 1.0"
_CC0_1_0_URL = "https://creativecommons.org/publicdomain/zero/1.0/"
_CC_BY_4_0 = "CC-BY 4.0"
_CC_BY_4_0_URL = "https://creativecommons.org/licenses/by/4.0/"
_INCOMPETECH = "https://incompetech.com/music/royalty-free/mp3-royaltyfree"

MEMORY_MUSIC_TRACKS = {
    # -------- Active set: bright, energetic, fun travel-recap mood --------
    # Kevin MacLeod tracks (incompetech.com), licensed CC-BY 4.0. Attribution
    # is rendered to users via the music summary serializer.
    "life-of-riley": MemoryMusicTrack(
        key="life-of-riley",
        title="Life of Riley",
        artist="Kevin MacLeod",
        asset_filename="life-of-riley.mp3",
        license=_CC_BY_4_0,
        license_url=_CC_BY_4_0_URL,
        source_url=f"{_INCOMPETECH}/Life%20of%20Riley.mp3",
        ffmpeg_audio_filter=(
            "aevalsrc="
            "0.034*sin(2*PI*261.63*t)+"
            "0.025*sin(2*PI*329.63*t)+"
            "0.017*sin(2*PI*392*t)"
            ":s=48000:channel_layout=stereo"
        ),
    ),
    "carefree": MemoryMusicTrack(
        key="carefree",
        title="Carefree",
        artist="Kevin MacLeod",
        asset_filename="carefree.mp3",
        license=_CC_BY_4_0,
        license_url=_CC_BY_4_0_URL,
        source_url=f"{_INCOMPETECH}/Carefree.mp3",
        ffmpeg_audio_filter=(
            "aevalsrc="
            "0.033*sin(2*PI*293.66*t)+"
            "0.024*sin(2*PI*369.99*t)+"
            "0.016*sin(2*PI*440*t)"
            ":s=48000:channel_layout=stereo"
        ),
    ),
    "wallpaper": MemoryMusicTrack(
        key="wallpaper",
        title="Wallpaper",
        artist="Kevin MacLeod",
        asset_filename="wallpaper.mp3",
        license=_CC_BY_4_0,
        license_url=_CC_BY_4_0_URL,
        source_url=f"{_INCOMPETECH}/Wallpaper.mp3",
        ffmpeg_audio_filter=(
            "aevalsrc="
            "0.034*sin(2*PI*329.63*t)+"
            "0.025*sin(2*PI*415.3*t)+"
            "0.017*sin(2*PI*493.88*t)"
            ":s=48000:channel_layout=stereo"
        ),
    ),
    "pixelland": MemoryMusicTrack(
        key="pixelland",
        title="Pixelland",
        artist="Kevin MacLeod",
        asset_filename="pixelland.mp3",
        license=_CC_BY_4_0,
        license_url=_CC_BY_4_0_URL,
        source_url=f"{_INCOMPETECH}/Pixelland.mp3",
        ffmpeg_audio_filter=(
            "aevalsrc="
            "0.034*sin(2*PI*349.23*t)+"
            "0.025*sin(2*PI*440*t)+"
            "0.017*sin(2*PI*523.25*t)"
            ":s=48000:channel_layout=stereo"
        ),
    ),
    "jaunty-gumption": MemoryMusicTrack(
        key="jaunty-gumption",
        title="Jaunty Gumption",
        artist="Kevin MacLeod",
        asset_filename="jaunty-gumption.mp3",
        license=_CC_BY_4_0,
        license_url=_CC_BY_4_0_URL,
        source_url=f"{_INCOMPETECH}/Jaunty%20Gumption.mp3",
        ffmpeg_audio_filter=(
            "aevalsrc="
            "0.034*sin(2*PI*220*t)+"
            "0.025*sin(2*PI*277.18*t)+"
            "0.017*sin(2*PI*329.63*t)"
            ":s=48000:channel_layout=stereo"
        ),
    ),
    "monkeys-spinning": MemoryMusicTrack(
        key="monkeys-spinning",
        title="Monkeys Spinning Monkeys",
        artist="Kevin MacLeod",
        asset_filename="monkeys-spinning-monkeys.mp3",
        license=_CC_BY_4_0,
        license_url=_CC_BY_4_0_URL,
        source_url=f"{_INCOMPETECH}/Monkeys%20Spinning%20Monkeys.mp3",
        ffmpeg_audio_filter=(
            "aevalsrc="
            "0.034*sin(2*PI*246.94*t)+"
            "0.025*sin(2*PI*311.13*t)+"
            "0.017*sin(2*PI*369.99*t)"
            ":s=48000:channel_layout=stereo"
        ),
    ),
    "funkorama": MemoryMusicTrack(
        key="funkorama",
        title="Funkorama",
        artist="Kevin MacLeod",
        asset_filename="funkorama.mp3",
        license=_CC_BY_4_0,
        license_url=_CC_BY_4_0_URL,
        source_url=f"{_INCOMPETECH}/Funkorama.mp3",
        ffmpeg_audio_filter=(
            "aevalsrc="
            "0.034*sin(2*PI*196*t)+"
            "0.025*sin(2*PI*261.63*t)+"
            "0.017*sin(2*PI*392*t)"
            ":s=48000:channel_layout=stereo"
        ),
    ),
    # -------- Retired set: kept for provenance/fallback, not user-selectable --------
    # Original CC0 (Komiku / Loyalty Freak Music) tracks. Disabled because their
    # mood was too mellow for an energetic recap; re-enable by flipping
    # ``enabled=True`` if you want them back in the random rotation.
    "sunrise-road": MemoryMusicTrack(
        key="sunrise-road",
        title="Introduction to your adventure",
        artist="Komiku",
        enabled=False,
        asset_filename="intro-adventure.ogg",
        license=_CC0_1_0,
        license_url=_CC0_1_0_URL,
        source_url="https://commons.wikimedia.org/wiki/File:Komiku_-_01_-_Introduction_to_your_adventure.ogg",
        ffmpeg_audio_filter=(
            "aevalsrc="
            "0.035*sin(2*PI*220*t)+"
            "0.026*sin(2*PI*277.18*t)+"
            "0.018*sin(2*PI*329.63*t)"
            ":s=48000:channel_layout=stereo"
        ),
    ),
    "coastal-light": MemoryMusicTrack(
        key="coastal-light",
        title="Travel to the Horizon",
        artist="Komiku",
        enabled=False,
        asset_filename="travel-horizon.mp3",
        license=_CC0_1_0,
        license_url=_CC0_1_0_URL,
        source_url="https://commons.wikimedia.org/wiki/File:Komiku_-_43_-_Travel_to_the_Horizon.ogg",
        ffmpeg_audio_filter=(
            "aevalsrc="
            "0.032*sin(2*PI*261.63*t)+"
            "0.024*sin(2*PI*392*t)+"
            "0.016*sin(2*PI*523.25*t)"
            ":s=48000:channel_layout=stereo"
        ),
    ),
    "lantern-evening": MemoryMusicTrack(
        key="lantern-evening",
        title="The road we use to travel when we were kids",
        artist="Komiku",
        enabled=False,
        asset_filename="open-road.mp3",
        license=_CC0_1_0,
        license_url=_CC0_1_0_URL,
        source_url="https://commons.wikimedia.org/wiki/File:Komiku_-_03_-_The_road_we_use_to_travel_when_we_were_kids.ogg",
        ffmpeg_audio_filter=(
            "aevalsrc="
            "0.03*sin(2*PI*196*t)+"
            "0.023*sin(2*PI*246.94*t)+"
            "0.017*sin(2*PI*293.66*t)"
            ":s=48000:channel_layout=stereo"
        ),
    ),
    "the-adventure": MemoryMusicTrack(
        key="the-adventure",
        title="The adventure",
        artist="Komiku",
        enabled=False,
        asset_filename="the-adventure.ogg",
        license=_CC0_1_0,
        license_url=_CC0_1_0_URL,
        source_url="https://commons.wikimedia.org/wiki/File:Komiku_-_22_-_The_adventure.ogg",
        ffmpeg_audio_filter=(
            "aevalsrc="
            "0.034*sin(2*PI*293.66*t)+"
            "0.026*sin(2*PI*369.99*t)+"
            "0.018*sin(2*PI*440*t)"
            ":s=48000:channel_layout=stereo"
        ),
    ),
    "arcade-adventure": MemoryMusicTrack(
        key="arcade-adventure",
        title="Poupi Great Adventures: The Arcade Game",
        artist="Komiku",
        enabled=False,
        asset_filename="arcade-adventure.mp3",
        license=_CC0_1_0,
        license_url=_CC0_1_0_URL,
        source_url="https://commons.wikimedia.org/wiki/File:Komiku_-_29_-_Poupi_Great_Adventures_The_Arcade_Game.ogg",
        ffmpeg_audio_filter=(
            "aevalsrc="
            "0.034*sin(2*PI*329.63*t)+"
            "0.025*sin(2*PI*415.3*t)+"
            "0.017*sin(2*PI*493.88*t)"
            ":s=48000:channel_layout=stereo"
        ),
    ),
    "victory": MemoryMusicTrack(
        key="victory",
        title="Victory",
        artist="Komiku",
        enabled=False,
        asset_filename="victory.mp3",
        license=_CC0_1_0,
        license_url=_CC0_1_0_URL,
        source_url="https://commons.wikimedia.org/wiki/File:Komiku_-_15_-_Victory.ogg",
        ffmpeg_audio_filter=(
            "aevalsrc="
            "0.035*sin(2*PI*246.94*t)+"
            "0.026*sin(2*PI*329.63*t)+"
            "0.018*sin(2*PI*392*t)"
            ":s=48000:channel_layout=stereo"
        ),
    ),
    "traveling-mind": MemoryMusicTrack(
        key="traveling-mind",
        title="Traveling in your mind",
        artist="Loyalty Freak Music",
        enabled=False,
        asset_filename="traveling-in-your-mind.mp3",
        license=_CC0_1_0,
        license_url=_CC0_1_0_URL,
        source_url="https://commons.wikimedia.org/wiki/File:Loyalty_Freak_Music_-_05_-_Traveling_in_your_mind.ogg",
        ffmpeg_audio_filter=(
            "aevalsrc="
            "0.033*sin(2*PI*220*t)+"
            "0.025*sin(2*PI*293.66*t)+"
            "0.017*sin(2*PI*440*t)"
            ":s=48000:channel_layout=stereo"
        ),
    ),
    "silent-placeholder": MemoryMusicTrack(
        key="silent-placeholder",
        title="Silent placeholder",
        artist="GoPlan",
        enabled=False,
        placeholder=True,
        ffmpeg_audio_filter="anullsrc=channel_layout=stereo:sample_rate=48000",
    ),
}


def list_memory_music_tracks() -> list[MemoryMusicTrack]:
    return [
        track
        for track in MEMORY_MUSIC_TRACKS.values()
        if track.enabled and not track.placeholder
    ]


def get_memory_music_track(key: str) -> MemoryMusicTrack | None:
    return MEMORY_MUSIC_TRACKS.get(key)


def resolve_music_asset_path(track: MemoryMusicTrack | None) -> Path | None:
    if track is None or not track.asset_filename:
        return None
    path = MUSIC_ASSET_DIR / track.asset_filename
    return path if path.exists() else None
