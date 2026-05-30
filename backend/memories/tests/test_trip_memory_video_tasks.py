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

MUSIC_KEY = "sunrise-road"


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

        first_call_args = run.call_args_list[0].args[0]
        first_call_kwargs = run.call_args_list[0].kwargs
        self.assertIsInstance(first_call_args, list)
        self.assertIn("libx264", first_call_args)
        self.assertIn("aac", first_call_args)
        self.assertIn("yuv420p", first_call_args)
        # The track has a bundled asset, so the render loops the real file
        # rather than the synth fallback.
        from memories.music_catalog import (
            get_memory_music_track,
            resolve_music_asset_path,
        )

        asset_path = resolve_music_asset_path(get_memory_music_track(MUSIC_KEY))
        self.assertIsNotNone(asset_path)
        self.assertIn("-stream_loop", first_call_args)
        self.assertIn(str(asset_path), first_call_args)
        self.assertIn("-af", first_call_args)
        self.assertIn("afade=t=out", " ".join(first_call_args))
        self.assertNotIn("anullsrc", " ".join(first_call_args))
        self.assertIn(str(output_video), first_call_args)
        self.assertNotIsInstance(first_call_args, str)
        self.assertEqual(first_call_kwargs["stdout"], subprocess.DEVNULL)
        self.assertEqual(first_call_kwargs["stderr"], subprocess.DEVNULL)
        self.assertEqual(first_call_kwargs["timeout"], 540)

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

        first_call_args = run.call_args_list[0].args[0]
        # With no bundled asset, the render still produces audible video via the
        # synth fallback (lavfi) rather than a silent track.
        self.assertIn("lavfi", first_call_args)
        self.assertNotIn("-stream_loop", first_call_args)
        self.assertNotIn("anullsrc", " ".join(first_call_args))
