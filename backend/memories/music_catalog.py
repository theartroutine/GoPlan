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
    # Attribution for the bundled asset. Required for CC-BY licensed tracks:
    # the license obliges us to show this credit to anyone who hears the music
    # (in-app picker AND the public share page). Empty for the synth fallback.
    license: str = ""
    license_url: str = ""
    source_url: str = ""


# Bundled tracks are music by Kevin MacLeod (incompetech.com), licensed under
# CC BY 4.0. CC-BY requires keeping the credit visible to listeners, so the
# real title/artist/license below are surfaced in the picker and share page.
# (Track keys stay stable so existing memories keep resolving.)
_CC_BY_4_0 = "CC BY 4.0"
_CC_BY_4_0_URL = "https://creativecommons.org/licenses/by/4.0/"
_INCOMPETECH_URL = "https://incompetech.com/music/royalty-free/"

MEMORY_MUSIC_TRACKS = {
    "sunrise-road": MemoryMusicTrack(
        key="sunrise-road",
        title="Air Prelude",
        artist="Kevin MacLeod (incompetech.com)",
        asset_filename="sunrise-road.mp3",
        license=_CC_BY_4_0,
        license_url=_CC_BY_4_0_URL,
        source_url=_INCOMPETECH_URL,
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
        title="At Rest",
        artist="Kevin MacLeod (incompetech.com)",
        asset_filename="coastal-light.mp3",
        license=_CC_BY_4_0,
        license_url=_CC_BY_4_0_URL,
        source_url=_INCOMPETECH_URL,
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
        title="Bathed in the Light",
        artist="Kevin MacLeod (incompetech.com)",
        asset_filename="lantern-evening.mp3",
        license=_CC_BY_4_0,
        license_url=_CC_BY_4_0_URL,
        source_url=_INCOMPETECH_URL,
        ffmpeg_audio_filter=(
            "aevalsrc="
            "0.03*sin(2*PI*196*t)+"
            "0.023*sin(2*PI*246.94*t)+"
            "0.017*sin(2*PI*293.66*t)"
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
