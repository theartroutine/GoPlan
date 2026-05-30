from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from django.conf import settings

from memories.music_catalog import get_memory_music_track, resolve_music_asset_path


@dataclass(frozen=True)
class MemoryVideoRenderResult:
    duration_seconds: int


def _setting(name: str, default: int) -> int:
    return int(getattr(settings, name, default))


def _concat_file_line(path: Path) -> str:
    escaped = str(path).replace("'", "'\\''")
    return f"file '{escaped}'"


def _write_concat_input_file(
    *,
    source_image_paths: Sequence[Path],
    concat_file_path: Path,
    seconds_per_photo: int,
) -> None:
    lines: list[str] = []
    for image_path in source_image_paths:
        lines.append(_concat_file_line(image_path))
        lines.append(f"duration {seconds_per_photo}")
    # FFmpeg concat demuxer requires the final file repeated for its duration
    # to be applied to the last still image.
    lines.append(_concat_file_line(source_image_paths[-1]))
    concat_file_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def render_memory_video(
    *,
    source_image_paths: Sequence[Path],
    output_video_path: Path,
    output_poster_path: Path,
    music_key: str,
    music_path: Path | None = None,
) -> MemoryVideoRenderResult:
    if not source_image_paths:
        raise ValueError("At least one source image is required.")

    width = _setting("TRIP_MEMORY_VIDEO_WIDTH", 1920)
    height = _setting("TRIP_MEMORY_VIDEO_HEIGHT", 1080)
    fps = _setting("TRIP_MEMORY_VIDEO_FPS", 30)
    seconds_per_photo = _setting("TRIP_MEMORY_SECONDS_PER_PHOTO", 3)
    timeout_seconds = _setting("TRIP_MEMORY_FFMPEG_TIMEOUT_SECONDS", 540)
    fade_seconds = _setting("TRIP_MEMORY_AUDIO_FADE_SECONDS", 2)
    duration_seconds = len(source_image_paths) * seconds_per_photo

    output_video_path.parent.mkdir(parents=True, exist_ok=True)
    output_poster_path.parent.mkdir(parents=True, exist_ok=True)
    concat_file_path = output_video_path.with_suffix(".concat.txt")
    _write_concat_input_file(
        source_image_paths=source_image_paths,
        concat_file_path=concat_file_path,
        seconds_per_photo=seconds_per_photo,
    )

    args = [
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(concat_file_path),
    ]

    # Resolve the audio source from the music catalog: prefer a bundled CC0
    # track file, then fall back to the catalog's synthesized lavfi filter so a
    # render always carries audio even before real assets are added.
    track = get_memory_music_track(music_key)
    resolved_music_path = music_path or resolve_music_asset_path(track)
    audio_filter = track.ffmpeg_audio_filter if track is not None else ""

    if resolved_music_path is not None and resolved_music_path.exists():
        args.extend(["-stream_loop", "-1", "-i", str(resolved_music_path)])
    elif audio_filter:
        args.extend(["-f", "lavfi", "-i", audio_filter])
    else:
        raise ValueError("Music track asset is not available.")

    video_filter = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,"
        f"setsar=1,fps={fps},format=yuv420p"
    )
    # Fade the music out over the final seconds so the clip ends gracefully
    # instead of cutting off mid-note.
    effective_fade = max(0, min(fade_seconds, duration_seconds))
    fade_start = max(0, duration_seconds - effective_fade)
    audio_out_filter = f"afade=t=out:st={fade_start}:d={effective_fade}"
    args.extend([
        "-t",
        str(duration_seconds),
        "-vf",
        video_filter,
        "-af",
        audio_out_filter,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ac",
        "2",
        "-shortest",
        "-movflags",
        "+faststart",
        str(output_video_path),
    ])
    subprocess.run(
        args,
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=timeout_seconds,
    )

    poster_args = [
        "ffmpeg",
        "-y",
        "-i",
        str(output_video_path),
        "-frames:v",
        "1",
        "-vf",
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2",
        str(output_poster_path),
    ]
    subprocess.run(
        poster_args,
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=timeout_seconds,
    )

    return MemoryVideoRenderResult(duration_seconds=duration_seconds)
