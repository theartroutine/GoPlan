from __future__ import annotations

import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

from celery.exceptions import Retry
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import TestCase, override_settings
from django.utils import timezone

from memories.memory_video_services import (
    _finish_memory_render_success,
    create_trip_memory_video,
)
from memories.models import (
    TripMemoryVideo,
    TripMemoryVideoSourceMode,
    TripMemoryVideoStatus,
    TripPhoto,
)
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus

MUSIC_KEY = "life-of-riley"


def _make_trip(captain, *, name="Memory Render Trip") -> Trip:
    trip = Trip.objects.create(
        created_by=captain,
        name=name,
        destination="Da Nang",
        start_date="2026-06-01",
        end_date="2026-06-05",
        status=TripStatus.PLANNING,
    )
    TripMember.objects.create(
        trip=trip,
        user=captain,
        role=TripRole.CAPTAIN,
        status=MemberStatus.ACTIVE,
    )
    return trip


def _make_photo(
    trip: Trip,
    uploader,
    *,
    index: int,
    save_medium: bool = True,
) -> TripPhoto:
    medium_name = f"trip-photos/{trip.id}/render-{index}-medium.webp"
    if save_medium:
        default_storage.save(medium_name, ContentFile(f"image-{index}".encode()))
    return TripPhoto.objects.create(
        trip=trip,
        uploaded_by=uploader,
        original_filename=f"render-{index}.jpg",
        original_width=1200,
        original_height=900,
        thumbnail=f"trip-photos/{trip.id}/render-{index}-thumb.webp",
        medium=medium_name,
        thumbnail_width=480,
        thumbnail_height=360,
        medium_width=1200,
        medium_height=900,
    )


@override_settings(
    TRIP_MEMORY_MIN_PHOTOS=2,
    TRIP_MEMORY_MAX_PHOTOS=10,
    TRIP_MEMORY_AUTO_PICK_PHOTOS=5,
    TRIP_MEMORY_RENDER_QUEUE="memory_render",
)
class TripMemoryVideoTaskTests(TestCase):
    def setUp(self) -> None:
        self.tempdir = TemporaryDirectory()
        self.override = override_settings(MEDIA_ROOT=self.tempdir.name)
        self.override.enable()
        self.captain = create_completed_user("render-cap@example.com", "rendercap", "RCP001")
        self.trip = _make_trip(self.captain)

    def tearDown(self) -> None:
        self.override.disable()
        self.tempdir.cleanup()

    def _photos(self, count: int, *, save_medium: bool = True) -> list[TripPhoto]:
        return [
            _make_photo(self.trip, self.captain, index=index, save_medium=save_medium)
            for index in range(count)
        ]

    def _memory(self, photos: list[TripPhoto], *, status=TripMemoryVideoStatus.QUEUED) -> TripMemoryVideo:
        return TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.captain,
            status=status,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[str(photo.id) for photo in photos],
            source_photo_count=len(photos),
            music_key=MUSIC_KEY,
        )

    @patch("memories.memory_video_services.render_trip_memory_video_task.apply_async")
    def test_create_memory_enqueues_render_task_and_stores_celery_task_id(self, apply_async):
        apply_async.return_value = SimpleNamespace(id="memory-task-123")
        photos = self._photos(2)

        with self.captureOnCommitCallbacks(execute=True):
            memory = create_trip_memory_video(
                trip_id=self.trip.id,
                actor=self.captain,
                title="Render me",
                source_mode=TripMemoryVideoSourceMode.MANUAL,
                photo_ids=[photo.id for photo in photos],
                music_key=MUSIC_KEY,
            )

        apply_async.assert_called_once_with(
            args=[str(memory.id)],
            queue="memory_render",
        )
        memory.refresh_from_db()
        self.assertEqual(memory.celery_task_id, "memory-task-123")

    @patch("memories.memory_video_services.render_trip_memory_video_task.apply_async")
    def test_create_memory_marks_failed_when_enqueue_raises(self, apply_async):
        apply_async.side_effect = RuntimeError("broker unavailable")
        photos = self._photos(2)

        with self.captureOnCommitCallbacks(execute=True):
            memory = create_trip_memory_video(
                trip_id=self.trip.id,
                actor=self.captain,
                title="No task",
                source_mode=TripMemoryVideoSourceMode.MANUAL,
                photo_ids=[photo.id for photo in photos],
                music_key=MUSIC_KEY,
            )

        memory.refresh_from_db()
        self.assertEqual(memory.status, TripMemoryVideoStatus.FAILED)
        self.assertEqual(memory.render_error_code, "MEMORY_RENDER_ENQUEUE_FAILED")
        self.assertEqual(memory.celery_task_id, "")

    @patch("memories.memory_video_services.render_memory_video")
    def test_render_task_moves_queued_memory_to_ready(self, render_memory_video):
        from memories.tasks import render_trip_memory_video_task

        photos = self._photos(2)
        memory = self._memory(photos)

        def fake_render(*, output_video_path, output_poster_path, **kwargs):
            rendering_memory = TripMemoryVideo.objects.get(pk=memory.id)
            self.assertEqual(rendering_memory.status, TripMemoryVideoStatus.RENDERING)
            self.assertIsNotNone(rendering_memory.render_started_at)
            Path(output_video_path).write_bytes(b"video")
            Path(output_poster_path).write_bytes(b"poster")
            return SimpleNamespace(duration_seconds=6)

        render_memory_video.side_effect = fake_render

        render_trip_memory_video_task(str(memory.id))

        memory.refresh_from_db()
        self.assertEqual(memory.status, TripMemoryVideoStatus.READY)
        self.assertEqual(memory.duration_seconds, 6)
        self.assertLessEqual(len(memory.video_file.name), 100)
        self.assertLessEqual(len(memory.poster_file.name), 100)
        self.assertEqual(memory.render_error_code, "")
        self.assertEqual(memory.render_error_message, "")
        self.assertIn(f"{memory.id}/r/", memory.video_file.name)
        self.assertIn(f"{memory.id}/r/", memory.poster_file.name)
        self.assertTrue(memory.video_file.name.endswith("/video.mp4"))
        self.assertTrue(memory.poster_file.name.endswith("/poster.webp"))
        self.assertTrue(default_storage.exists(memory.video_file.name))
        self.assertTrue(default_storage.exists(memory.poster_file.name))
        self.assertIsNotNone(memory.render_finished_at)

    @patch("memories.memory_video_services.render_memory_video")
    def test_render_task_reclaims_stale_rendering_memory(self, render_memory_video):
        from memories.tasks import render_trip_memory_video_task

        photos = self._photos(2)
        memory = self._memory(photos, status=TripMemoryVideoStatus.RENDERING)
        stale_started_at = timezone.now() - timezone.timedelta(minutes=20)
        memory.render_started_at = stale_started_at
        memory.save(update_fields=["render_started_at", "updated_at"])

        def fake_render(*, output_video_path, output_poster_path, **kwargs):
            rendering_memory = TripMemoryVideo.objects.get(pk=memory.id)
            self.assertEqual(rendering_memory.status, TripMemoryVideoStatus.RENDERING)
            self.assertGreater(rendering_memory.render_started_at, stale_started_at)
            Path(output_video_path).write_bytes(b"video")
            Path(output_poster_path).write_bytes(b"poster")
            return SimpleNamespace(duration_seconds=6)

        render_memory_video.side_effect = fake_render

        with self.settings(TRIP_MEMORY_RENDER_STALE_SECONDS=900):
            render_trip_memory_video_task(str(memory.id))

        memory.refresh_from_db()
        self.assertEqual(memory.status, TripMemoryVideoStatus.READY)
        self.assertEqual(memory.duration_seconds, 6)

    def test_losing_stale_render_attempt_does_not_delete_winning_files(self):
        photos = self._photos(2)
        memory = self._memory(photos, status=TripMemoryVideoStatus.RENDERING)
        old_started_at = timezone.now() - timezone.timedelta(minutes=20)
        new_started_at = timezone.now()
        memory.render_started_at = old_started_at
        memory.save(update_fields=["render_started_at", "updated_at"])
        stale_memory = TripMemoryVideo.objects.get(pk=memory.id)

        TripMemoryVideo.objects.filter(pk=memory.id).update(
            render_started_at=new_started_at,
            updated_at=timezone.now(),
        )
        winning_memory = TripMemoryVideo.objects.get(pk=memory.id)

        with TemporaryDirectory() as tempdir:
            temp_path = Path(tempdir)
            winning_video = temp_path / "winning.mp4"
            winning_poster = temp_path / "winning.webp"
            stale_video = temp_path / "stale.mp4"
            stale_poster = temp_path / "stale.webp"
            winning_video.write_bytes(b"winning-video")
            winning_poster.write_bytes(b"winning-poster")
            stale_video.write_bytes(b"stale-video")
            stale_poster.write_bytes(b"stale-poster")

            _finish_memory_render_success(
                memory=winning_memory,
                video_path=winning_video,
                poster_path=winning_poster,
                duration_seconds=6,
            )
            memory.refresh_from_db()
            winning_video_name = memory.video_file.name
            winning_poster_name = memory.poster_file.name

            _finish_memory_render_success(
                memory=stale_memory,
                video_path=stale_video,
                poster_path=stale_poster,
                duration_seconds=999,
            )

        memory.refresh_from_db()
        self.assertEqual(memory.status, TripMemoryVideoStatus.READY)
        self.assertEqual(memory.duration_seconds, 6)
        self.assertEqual(memory.video_file.name, winning_video_name)
        self.assertEqual(memory.poster_file.name, winning_poster_name)
        self.assertTrue(default_storage.exists(winning_video_name))
        self.assertTrue(default_storage.exists(winning_poster_name))

    @patch("memories.memory_video_services.render_memory_video")
    def test_render_task_retries_active_rendering_memory(self, render_memory_video):
        from memories.tasks import render_trip_memory_video_task

        photos = self._photos(2)
        memory = self._memory(photos, status=TripMemoryVideoStatus.RENDERING)
        started_at = timezone.now()
        memory.render_started_at = started_at
        memory.save(update_fields=["render_started_at", "updated_at"])

        with (
            self.settings(TRIP_MEMORY_RENDER_STALE_SECONDS=900),
            patch.object(render_trip_memory_video_task, "retry", side_effect=Retry()) as retry,
            self.assertRaises(Retry),
        ):
            render_trip_memory_video_task(str(memory.id))

        retry.assert_called_once()
        retry_kwargs = retry.call_args.kwargs
        self.assertGreaterEqual(retry_kwargs["countdown"], 1)
        self.assertLessEqual(retry_kwargs["countdown"], 900)
        render_memory_video.assert_not_called()
        memory.refresh_from_db()
        self.assertEqual(memory.status, TripMemoryVideoStatus.RENDERING)
        self.assertEqual(memory.render_started_at, started_at)

    @patch(
        "memories.memory_video_services.render_memory_video",
        side_effect=subprocess.TimeoutExpired(cmd=["ffmpeg"], timeout=540),
    )
    def test_render_task_marks_failed_when_ffmpeg_times_out(self, render_memory_video):
        from memories.tasks import render_trip_memory_video_task

        photos = self._photos(2)
        memory = self._memory(photos)

        render_trip_memory_video_task(str(memory.id))

        render_memory_video.assert_called_once()
        memory.refresh_from_db()
        self.assertEqual(memory.status, TripMemoryVideoStatus.FAILED)
        self.assertEqual(memory.render_error_code, "MEMORY_RENDER_FAILED")
        self.assertIn("timed out", memory.render_error_message.lower())

    def test_render_task_marks_failed_when_source_photo_file_is_missing(self):
        from memories.tasks import render_trip_memory_video_task

        photos = self._photos(2, save_medium=False)
        memory = self._memory(photos)

        render_trip_memory_video_task(str(memory.id))

        memory.refresh_from_db()
        self.assertEqual(memory.status, TripMemoryVideoStatus.FAILED)
        self.assertEqual(memory.render_error_code, "MEMORY_SOURCE_UNAVAILABLE")
        self.assertIn("source photo", memory.render_error_message.lower())
        self.assertIsNotNone(memory.render_finished_at)

    @patch("memories.memory_video_services.render_memory_video")
    def test_render_task_does_nothing_when_memory_was_deleted_before_claim(self, render_memory_video):
        from memories.tasks import render_trip_memory_video_task

        photos = self._photos(2)
        memory = self._memory(photos)
        memory_id = memory.id
        memory.delete()

        render_trip_memory_video_task(str(memory_id))

        render_memory_video.assert_not_called()
        self.assertFalse(TripMemoryVideo.objects.filter(pk=memory_id).exists())

    @patch("memories.memory_video_services.render_memory_video")
    def test_render_task_does_not_overwrite_non_queued_memory(self, render_memory_video):
        from memories.tasks import render_trip_memory_video_task

        photos = self._photos(2)
        memory = self._memory(photos, status=TripMemoryVideoStatus.READY)
        memory.duration_seconds = 99
        memory.save(update_fields=["duration_seconds", "updated_at"])

        render_trip_memory_video_task(str(memory.id))

        render_memory_video.assert_not_called()
        memory.refresh_from_db()
        self.assertEqual(memory.status, TripMemoryVideoStatus.READY)
        self.assertEqual(memory.duration_seconds, 99)


class MemoryVideoRenderingHelperTests(TestCase):
    def setUp(self) -> None:
        self.tempdir = TemporaryDirectory()
        self.override = override_settings(MEDIA_ROOT=self.tempdir.name)
        self.override.enable()

    def tearDown(self) -> None:
        self.override.disable()
        self.tempdir.cleanup()

    @staticmethod
    def _final_mux_call(run):
        """Return the args of the final concat/mux ffmpeg invocation."""
        for call in run.call_args_list:
            args = call.args[0]
            if "concat" in args and ("-stream_loop" in args or "lavfi" in args):
                return args
        raise AssertionError("No final mux ffmpeg call was recorded.")

    @patch("memories.memory_video_rendering.subprocess.run")
    def test_ffmpeg_args_use_required_profile_audio_track_and_list_form(self, run):
        from memories.memory_video_rendering import render_memory_video

        with self.settings(TRIP_MEMORY_SECONDS_PER_PHOTO=3):
            output_dir = Path(default_storage.location) / "tmp-render-args"
            output_dir.mkdir(parents=True, exist_ok=True)
            source_image = output_dir / "source.webp"
            output_video = output_dir / "video.mp4"
            output_poster = output_dir / "poster.webp"
            source_image.write_bytes(b"image")

            render_memory_video(
                source_image_paths=[source_image],
                output_video_path=output_video,
                output_poster_path=output_poster,
                music_key=MUSIC_KEY,
            )

        # Stage 1 renders each photo into its own cinematic clip.
        clip_args = run.call_args_list[0].args[0]
        clip_joined = " ".join(clip_args)
        self.assertIsInstance(clip_args, list)
        self.assertIn("-filter_complex", clip_args)
        self.assertIn("zoompan", clip_joined)
        self.assertIn("overlay", clip_joined)
        self.assertIn("gblur", clip_joined)
        self.assertIn("libx264", clip_args)

        # The final mux carries the looped CC0 track and bounds it with -t
        # (never -shortest, which OOMs against an infinite audio loop).
        final_args = self._final_mux_call(run)
        final_joined = " ".join(final_args)
        from memories.music_catalog import (
            get_memory_music_track,
            resolve_music_asset_path,
        )

        asset_path = resolve_music_asset_path(get_memory_music_track(MUSIC_KEY))
        self.assertIsNotNone(asset_path)
        self.assertIn("-stream_loop", final_args)
        self.assertIn(str(asset_path), final_args)
        self.assertNotIn("-shortest", final_args)
        self.assertIn("-t", final_args)
        self.assertIn("aac", final_args)
        self.assertIn("yuv420p", final_args)
        self.assertIn("afade=t=in:st=0:d=2", final_joined)
        self.assertIn("afade=t=out", final_joined)
        self.assertNotIn("anullsrc", final_joined)
        self.assertIn(str(output_video), final_args)
        self.assertNotIsInstance(final_args, str)

        # Every ffmpeg call is silenced and bounded by the configured timeout.
        for call in run.call_args_list:
            self.assertEqual(call.kwargs["stdout"], subprocess.DEVNULL)
            self.assertEqual(call.kwargs["stderr"], subprocess.PIPE)
            self.assertTrue(call.kwargs["text"])
            self.assertEqual(call.kwargs["timeout"], 540)

    @patch("memories.memory_video_rendering.subprocess.run")
    def test_ffmpeg_failure_logs_stderr_excerpt(self, run):
        from memories.memory_video_rendering import _run_ffmpeg

        run.side_effect = subprocess.CalledProcessError(
            returncode=1,
            cmd=["ffmpeg", "-bad-filter"],
            stderr="bad filtergraph\nsource image decode failed",
        )

        with self.assertLogs("memories.memory_video_rendering", level="ERROR") as captured:
            with self.assertRaises(subprocess.CalledProcessError):
                _run_ffmpeg(["ffmpeg", "-bad-filter"], timeout=5)

        self.assertIn("bad filtergraph", "\n".join(captured.output))

    @patch("memories.memory_video_rendering.resolve_music_asset_path", return_value=None)
    @patch("memories.memory_video_rendering.subprocess.run")
    def test_ffmpeg_falls_back_to_synth_audio_when_asset_missing(self, run, _resolve):
        from memories.memory_video_rendering import render_memory_video

        with self.settings(TRIP_MEMORY_SECONDS_PER_PHOTO=3):
            output_dir = Path(default_storage.location) / "tmp-render-synth"
            output_dir.mkdir(parents=True, exist_ok=True)
            source_image = output_dir / "source.webp"
            output_video = output_dir / "video.mp4"
            output_poster = output_dir / "poster.webp"
            source_image.write_bytes(b"image")

            render_memory_video(
                source_image_paths=[source_image],
                output_video_path=output_video,
                output_poster_path=output_poster,
                music_key=MUSIC_KEY,
            )

        final_args = self._final_mux_call(run)
        # With no bundled asset, the render still produces audible video via the
        # synth fallback (lavfi) rather than a silent track.
        self.assertIn("lavfi", final_args)
        self.assertNotIn("-stream_loop", final_args)
        self.assertNotIn("anullsrc", " ".join(final_args))

    def test_clip_render_args_have_no_crossfade(self) -> None:
        from memories.memory_video_rendering import (
            _build_clip_render_args,
            _load_profile,
        )

        with self.settings(TRIP_MEMORY_SECONDS_PER_PHOTO=4):
            profile = _load_profile()
            args = _build_clip_render_args(
                image_path=Path("/tmp/p.webp"),
                index=0,
                output_path=Path("/tmp/clip.mp4"),
                profile=profile,
            )

        joined = " ".join(args)
        # A single clip carries Ken Burns motion but no transition or audio.
        self.assertIn("zoompan", joined)
        self.assertNotIn("xfade", joined)
        self.assertIn("-an", args)

    def test_transition_args_crossfade_only_clip_edges(self) -> None:
        from memories.memory_video_rendering import (
            _build_transition_args,
            _load_profile,
        )

        with self.settings(
            TRIP_MEMORY_SECONDS_PER_PHOTO=4,
            TRIP_MEMORY_TRANSITION_SECONDS=0.8,
        ):
            profile = _load_profile()
            args = _build_transition_args(
                prev_clip_path=Path("/tmp/a.mp4"),
                next_clip_path=Path("/tmp/b.mp4"),
                output_path=Path("/tmp/t.mp4"),
                profile=profile,
            )

        joined = " ".join(args)
        # Only the 0.8s touching edges feed xfade, so memory stays bounded.
        self.assertIn("xfade=transition=fade", joined)
        self.assertIn("duration=0.8", joined)
        # The previous clip is seeked to its final 0.8s (tail at 4 - 0.8 = 3.2).
        self.assertIn("3.2", joined)
        self.assertEqual(args.count("-i"), 2)

    def test_concat_lines_interleave_bodies_and_transitions(self) -> None:
        from memories.memory_video_rendering import (
            _build_concat_lines,
            _load_profile,
        )

        clips = [Path(f"/tmp/clip-{i}.mp4") for i in range(3)]
        transitions = [Path(f"/tmp/trans-{i}.mp4") for i in range(2)]
        with self.settings(
            TRIP_MEMORY_SECONDS_PER_PHOTO=4,
            TRIP_MEMORY_TRANSITION_SECONDS=0.8,
        ):
            profile = _load_profile()
            lines = _build_concat_lines(
                clip_paths=clips,
                transition_paths=transitions,
                profile=profile,
            )

        text = "\n".join(lines)
        # body0 -> trans0 -> body1 -> trans1 -> body2.
        for clip in clips:
            self.assertIn(str(clip), text)
        for transition in transitions:
            self.assertIn(str(transition), text)
        # First clip stops where its outgoing transition begins (4 - 0.8 = 3.2).
        self.assertIn("outpoint 3.2", text)
        # Following clips start after the incoming transition edge.
        self.assertIn("inpoint 0.8", text)
        # Total duration = 3*4 - 2*0.8 = 10.4 seconds.
        self.assertAlmostEqual(profile.total_duration(3), 10.4, places=6)

    def test_zero_transition_concat_uses_full_clips_without_xfade_segments(self) -> None:
        from memories.memory_video_rendering import (
            _build_concat_lines,
            _load_profile,
        )

        clips = [Path(f"/tmp/clip-{i}.mp4") for i in range(3)]
        with self.settings(
            TRIP_MEMORY_SECONDS_PER_PHOTO=4,
            TRIP_MEMORY_TRANSITION_SECONDS=0,
        ):
            profile = _load_profile()
            lines = _build_concat_lines(
                clip_paths=clips,
                transition_paths=[],
                profile=profile,
            )

        text = "\n".join(lines)
        self.assertEqual([line for line in lines if line.startswith("file ")], [
            "file '/tmp/clip-0.mp4'",
            "file '/tmp/clip-1.mp4'",
            "file '/tmp/clip-2.mp4'",
        ])
        self.assertNotIn("inpoint", text)
        self.assertNotIn("outpoint", text)
        self.assertAlmostEqual(profile.total_duration(3), 12, places=6)

    def test_single_photo_concat_has_only_the_clip(self) -> None:
        from memories.memory_video_rendering import (
            _build_concat_lines,
            _load_profile,
        )

        with self.settings(TRIP_MEMORY_SECONDS_PER_PHOTO=4):
            profile = _load_profile()
            lines = _build_concat_lines(
                clip_paths=[Path("/tmp/only.mp4")],
                transition_paths=[],
                profile=profile,
            )

        text = "\n".join(lines)
        self.assertIn("/tmp/only.mp4", text)
        self.assertNotIn("inpoint", text)
        self.assertNotIn("outpoint", text)
        self.assertAlmostEqual(profile.total_duration(1), 4, places=6)
