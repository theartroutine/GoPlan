from __future__ import annotations

import logging
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from django.conf import settings

from memories.music_catalog import get_memory_music_track, resolve_music_asset_path

logger = logging.getLogger(__name__)
FFMPEG_STDERR_LOG_LIMIT = 4000


@dataclass(frozen=True)
class MemoryVideoRenderResult:
    duration_seconds: int


def _setting(name: str, default: int) -> int:
    return int(getattr(settings, name, default))


def _setting_float(name: str, default: float) -> float:
    return float(getattr(settings, name, default))


def _setting_str(name: str, default: str) -> str:
    return str(getattr(settings, name, default))


def _even(value: float) -> int:
    """Round to the nearest even integer (required by yuv420p)."""
    pixels = int(round(value))
    return pixels + (pixels % 2)


def _concat_file_line(path: Path) -> str:
    escaped = str(path).replace("'", "'\\''")
    return f"file '{escaped}'"


@dataclass(frozen=True)
class _RenderProfile:
    width: int
    height: int
    fps: int
    seconds_per_photo: float
    transition_seconds: float
    video_fade_seconds: float
    zoom_amount: float
    blur_sigma: float
    supersample: float
    preset: str
    crf: int
    audio_fade_seconds: float
    timeout_seconds: int

    @property
    def base_width(self) -> int:
        # Composite well above the output resolution so zoompan's per-frame
        # integer crop rounding stays sub-pixel after the final downscale.
        # zoompan picks an integer crop window every frame, so the residual
        # error at the output is ~1/supersample px: 0.5px at 2x still visibly
        # jitters ("shakes"), while 4x (~0.25px) reads as a steady image.
        return _even(self.width * self.supersample)

    @property
    def base_height(self) -> int:
        return _even(self.height * self.supersample)

    @property
    def clip_frames(self) -> int:
        return max(1, round(self.seconds_per_photo * self.fps))

    @property
    def transition(self) -> float:
        # A transition cannot consume more than half a clip on each side, and a
        # clip must keep a positive "body" between its two transitions.
        ceiling = max(0.0, (self.seconds_per_photo / 2) - 0.1)
        return max(0.0, min(self.transition_seconds, ceiling))

    @property
    def body_seconds(self) -> float:
        """Solid portion of a middle clip between its incoming/outgoing fades."""
        return self.seconds_per_photo - 2 * self.transition

    @property
    def edge_body_seconds(self) -> float:
        """Solid portion of the first/last clip (only one transition edge)."""
        return self.seconds_per_photo - self.transition

    def total_duration(self, photo_count: int) -> float:
        # Each crossfade overlaps the previous clip, so transitions shorten the
        # overall timeline compared to a naive sum of hold durations.
        overlap = max(0, photo_count - 1) * self.transition
        return photo_count * self.seconds_per_photo - overlap


def _load_profile() -> _RenderProfile:
    return _RenderProfile(
        width=_setting("TRIP_MEMORY_VIDEO_WIDTH", 1920),
        height=_setting("TRIP_MEMORY_VIDEO_HEIGHT", 1080),
        fps=_setting("TRIP_MEMORY_VIDEO_FPS", 30),
        seconds_per_photo=_setting_float("TRIP_MEMORY_SECONDS_PER_PHOTO", 4),
        transition_seconds=_setting_float("TRIP_MEMORY_TRANSITION_SECONDS", 0.8),
        video_fade_seconds=_setting_float("TRIP_MEMORY_VIDEO_FADE_SECONDS", 0.8),
        zoom_amount=_setting_float("TRIP_MEMORY_KEN_BURNS_ZOOM", 0.12),
        blur_sigma=_setting_float("TRIP_MEMORY_BACKGROUND_BLUR_SIGMA", 20),
        supersample=_setting_float("TRIP_MEMORY_KEN_BURNS_SUPERSAMPLE", 2.0),
        preset=_setting_str("TRIP_MEMORY_VIDEO_PRESET", "faster"),
        crf=_setting("TRIP_MEMORY_VIDEO_CRF", 20),
        audio_fade_seconds=_setting_float("TRIP_MEMORY_AUDIO_FADE_SECONDS", 2),
        timeout_seconds=_setting("TRIP_MEMORY_FFMPEG_TIMEOUT_SECONDS", 540),
    )


# -------- Stage 1: per-photo cinematic clip --------

def _clip_filter(*, index: int, profile: _RenderProfile) -> str:
    """Filtergraph for one photo: blurred fill + gentle Ken Burns motion.

    The source image is split into a cover-cropped, blurred, slightly darkened
    background and a fully visible foreground centered on top, so portrait or
    odd-ratio photos read as a premium frame instead of black letterbox bars.
    A slow ``zoompan`` then breathes the composite in or out (alternating per
    photo) for the Apple/Google "memories" feel.
    """
    base_w = profile.base_width
    base_h = profile.base_height
    # Blur the background at a low resolution, then upscale: it is blurry
    # anyway, so this looks identical to blurring at full resolution but costs
    # a fraction of the time at the supersample working size.
    blur_w = _even(profile.width / 2)
    blur_h = _even(profile.height / 2)
    frames = profile.clip_frames
    amount = profile.zoom_amount
    # Drive the zoom from the output frame index ``on`` (0..frames-1) instead of
    # accumulating a per-frame increment, so the curve can ease. ``trim`` keeps
    # only the first ``frames`` outputs (all from input frame 0), and clamping
    # ``on`` parks any frames ffmpeg overproduces from the looped image at the
    # final zoom instead of overshooting.
    denom = max(1, frames - 1)
    progress = f"min(on,{denom})/{denom}"

    # Cosine ease-in-out: the zoom accelerates softly at the start and
    # decelerates at the end (the Apple/Google "memories" feel) rather than the
    # mechanical constant-speed ramp. ``z`` stays within [1, 1+amount].
    if index % 2 == 0:
        # Ease zoom-in: 1.0 -> 1 + amount.
        zoom_expr = f"1+{amount:.6f}*(1-cos(PI*{progress}))/2"
    else:
        # Ease zoom-out: 1 + amount -> 1.0.
        zoom_expr = f"1+{amount:.6f}*(1+cos(PI*{progress}))/2"

    # Keep the motion centered so the zoom never reveals an empty edge.
    x_expr = "iw/2-(iw/zoom/2)"
    y_expr = "ih/2-(ih/zoom/2)"

    return (
        "[0:v]split=2[bg][fg];"
        f"[bg]scale={blur_w}:{blur_h}:force_original_aspect_ratio=increase,"
        f"crop={blur_w}:{blur_h},gblur=sigma={profile.blur_sigma:g}:steps=3,"
        f"eq=brightness=-0.08,scale={base_w}:{base_h}[bgb];"
        f"[fg]scale={base_w}:{base_h}:force_original_aspect_ratio=decrease[fgs];"
        "[bgb][fgs]overlay=(W-w)/2:(H-h)/2[comp];"
        f"[comp]zoompan=z='{zoom_expr}':x='{x_expr}':y='{y_expr}':"
        f"d={frames}:s={profile.width}x{profile.height}:fps={profile.fps},"
        f"trim=duration={profile.seconds_per_photo:g},setpts=PTS-STARTPTS,"
        f"fps={profile.fps},setsar=1,format=yuv420p[v]"
    )


def _encode_video_opts(profile: _RenderProfile) -> list[str]:
    return [
        "-c:v",
        "libx264",
        "-preset",
        profile.preset,
        "-crf",
        str(profile.crf),
        "-pix_fmt",
        "yuv420p",
    ]


def _build_clip_render_args(
    *, image_path: Path, index: int, output_path: Path, profile: _RenderProfile
) -> list[str]:
    return [
        "ffmpeg",
        "-y",
        "-loop",
        "1",
        "-i",
        str(image_path),
        "-t",
        f"{profile.seconds_per_photo:g}",
        "-filter_complex",
        _clip_filter(index=index, profile=profile),
        "-map",
        "[v]",
        "-an",
        *_encode_video_opts(profile),
        "-r",
        str(profile.fps),
        str(output_path),
    ]


# -------- Stage 2: pairwise crossfade of clip edges --------

def _build_transition_args(
    *,
    prev_clip_path: Path,
    next_clip_path: Path,
    output_path: Path,
    profile: _RenderProfile,
) -> list[str]:
    """Cross-fade only the touching edges of two clips.

    Feeding xfade just the ``transition`` seconds from each side keeps memory
    bounded to two short inputs, instead of chaining every clip into one graph
    (which buffers whole clips and exhausts RAM on large memories).
    """
    duration = profile.transition
    tail_start = profile.seconds_per_photo - duration
    return [
        "ffmpeg",
        "-y",
        "-ss",
        f"{tail_start:g}",
        "-t",
        f"{duration:g}",
        "-i",
        str(prev_clip_path),
        "-ss",
        "0",
        "-t",
        f"{duration:g}",
        "-i",
        str(next_clip_path),
        "-filter_complex",
        (
            "[0:v][1:v]xfade=transition=fade:"
            f"duration={duration:g}:offset=0,format=yuv420p[v]"
        ),
        "-map",
        "[v]",
        "-an",
        *_encode_video_opts(profile),
        "-r",
        str(profile.fps),
        str(output_path),
    ]


def _build_concat_lines(
    *,
    clip_paths: Sequence[Path],
    transition_paths: Sequence[Path],
    profile: _RenderProfile,
) -> list[str]:
    """Concat-demuxer script interleaving clip bodies with transition segments.

    Each clip contributes only its solid "body" (the transition edges are
    represented by the dedicated transition clips), so the timeline reads
    body0 → trans0 → body1 → trans1 → ... → bodyN with continuous motion.
    """
    n = len(clip_paths)
    transition = profile.transition
    body_end = profile.seconds_per_photo - transition

    lines: list[str] = []
    if n == 1:
        lines.append(_concat_file_line(clip_paths[0]))
        return lines
    if transition <= 0:
        return [_concat_file_line(path) for path in clip_paths]

    # First clip: from start up to where its outgoing transition begins.
    lines.append(_concat_file_line(clip_paths[0]))
    lines.append(f"outpoint {body_end:g}")

    for i in range(n - 1):
        lines.append(_concat_file_line(transition_paths[i]))
        nxt = clip_paths[i + 1]
        lines.append(_concat_file_line(nxt))
        # Each following clip starts after its incoming transition edge.
        lines.append(f"inpoint {transition:g}")
        if i + 1 < n - 1:
            # Middle clip: also stop before its outgoing transition edge.
            lines.append(f"outpoint {body_end:g}")

    return lines


# -------- Stage 3: final mux with music + global fades --------

def _resolve_audio_input(
    *, music_key: str, music_path: Path | None
) -> list[str]:
    """Build the ffmpeg input args for the soundtrack.

    Prefer a bundled CC0 track file (looped to cover the video) and otherwise
    fall back to the catalog's synthesized lavfi filter, so a render always
    carries audio even before real assets are added.
    """
    track = get_memory_music_track(music_key)
    resolved_music_path = music_path or resolve_music_asset_path(track)
    audio_filter = track.ffmpeg_audio_filter if track is not None else ""

    if resolved_music_path is not None and resolved_music_path.exists():
        return ["-stream_loop", "-1", "-i", str(resolved_music_path)]
    if audio_filter:
        return ["-f", "lavfi", "-i", audio_filter]
    raise ValueError("Music track asset is not available.")


def _build_final_args(
    *,
    concat_file_path: Path,
    output_video_path: Path,
    total: float,
    profile: _RenderProfile,
    music_key: str,
    music_path: Path | None,
) -> list[str]:
    audio_input = _resolve_audio_input(music_key=music_key, music_path=music_path)

    fade = profile.video_fade_seconds
    fade_out_start = max(0.0, total - fade)
    video_filter = (
        f"fade=t=in:st=0:d={fade:g},"
        f"fade=t=out:st={fade_out_start:g}:d={fade:g},format=yuv420p"
    )

    audio_fade = max(0.0, min(profile.audio_fade_seconds, total))
    audio_fade_in = audio_fade
    audio_fade_out_start = max(0.0, total - audio_fade)
    audio_filter = (
        f"afade=t=in:st=0:d={audio_fade_in:g},"
        f"afade=t=out:st={audio_fade_out_start:g}:d={audio_fade:g}"
    )

    # NOTE: never combine "-stream_loop -1" with "-shortest" — ffmpeg buffers
    # the infinite audio source and exhausts memory. Bound with an explicit
    # "-t total" instead.
    return [
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(concat_file_path),
        *audio_input,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-t",
        f"{total:g}",
        "-vf",
        video_filter,
        "-af",
        audio_filter,
        *_encode_video_opts(profile),
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        str(output_video_path),
    ]


def _build_poster_args(
    *,
    output_video_path: Path,
    output_poster_path: Path,
    profile: _RenderProfile,
) -> list[str]:
    # Seek into the middle of the first photo so the poster is a real frame
    # rather than the black opening of the fade-in.
    seek = profile.seconds_per_photo / 2
    return [
        "ffmpeg",
        "-y",
        "-ss",
        f"{seek:g}",
        "-i",
        str(output_video_path),
        "-frames:v",
        "1",
        str(output_poster_path),
    ]


def _stderr_excerpt(stderr: object) -> str:
    if stderr is None:
        return ""
    if isinstance(stderr, bytes):
        text = stderr.decode("utf-8", errors="replace")
    else:
        text = str(stderr)
    return text.strip()[-FFMPEG_STDERR_LOG_LIMIT:]


def _run_ffmpeg(args: list[str], *, timeout: int) -> None:
    try:
        subprocess.run(
            args,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout,
        )
    except subprocess.CalledProcessError as exc:
        stderr = _stderr_excerpt(exc.stderr)
        if stderr:
            logger.error(
                "ffmpeg failed with exit code %s. stderr:\n%s",
                exc.returncode,
                stderr,
            )
        else:
            logger.error("ffmpeg failed with exit code %s and no stderr.", exc.returncode)
        raise
    except subprocess.TimeoutExpired as exc:
        stderr = _stderr_excerpt(exc.stderr)
        if stderr:
            logger.error("ffmpeg timed out after %ss. stderr:\n%s", timeout, stderr)
        else:
            logger.error("ffmpeg timed out after %ss with no stderr.", timeout)
        raise


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

    profile = _load_profile()
    photo_count = len(source_image_paths)
    total = profile.total_duration(photo_count)

    output_video_path.parent.mkdir(parents=True, exist_ok=True)
    output_poster_path.parent.mkdir(parents=True, exist_ok=True)

    # The render is split into bounded-memory passes (one or two clips at a
    # time) and stitched with the concat demuxer, so memory stays flat no
    # matter how many photos a memory contains.
    with tempfile.TemporaryDirectory(prefix="memory-render-") as tmp_name:
        tmp = Path(tmp_name)

        clip_paths: list[Path] = []
        for index, image_path in enumerate(source_image_paths):
            clip_path = tmp / f"clip-{index:04d}.mp4"
            _run_ffmpeg(
                _build_clip_render_args(
                    image_path=Path(image_path),
                    index=index,
                    output_path=clip_path,
                    profile=profile,
                ),
                timeout=profile.timeout_seconds,
            )
            clip_paths.append(clip_path)

        transition_paths: list[Path] = []
        if profile.transition > 0:
            for index in range(photo_count - 1):
                transition_path = tmp / f"trans-{index:04d}.mp4"
                _run_ffmpeg(
                    _build_transition_args(
                        prev_clip_path=clip_paths[index],
                        next_clip_path=clip_paths[index + 1],
                        output_path=transition_path,
                        profile=profile,
                    ),
                    timeout=profile.timeout_seconds,
                )
                transition_paths.append(transition_path)

        concat_file_path = tmp / "segments.txt"
        concat_lines = _build_concat_lines(
            clip_paths=clip_paths,
            transition_paths=transition_paths,
            profile=profile,
        )
        concat_file_path.write_text("\n".join(concat_lines) + "\n", encoding="utf-8")

        _run_ffmpeg(
            _build_final_args(
                concat_file_path=concat_file_path,
                output_video_path=output_video_path,
                total=total,
                profile=profile,
                music_key=music_key,
                music_path=music_path,
            ),
            timeout=profile.timeout_seconds,
        )

    _run_ffmpeg(
        _build_poster_args(
            output_video_path=output_video_path,
            output_poster_path=output_poster_path,
            profile=profile,
        ),
        timeout=profile.timeout_seconds,
    )

    return MemoryVideoRenderResult(duration_seconds=round(total))
