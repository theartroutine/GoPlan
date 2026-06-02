from __future__ import annotations

import io
import threading
import time
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import close_old_connections, connections, transaction
from django.test import TransactionTestCase, override_settings
from PIL import Image as PILImage

from memories.memory_video_services import create_trip_memory_video
from memories.models import (
    TripMemoryVideo,
    TripMemoryVideoSourceMode,
    TripPhoto,
)
from memories.services import create_trip_photos
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus
from trips.services import TripTerminalError


def _make_trip(captain, *, status=TripStatus.PLANNING) -> Trip:
    trip = Trip.objects.create(
        created_by=captain,
        name="Memory Race Trip",
        destination="Da Nang",
        start_date="2026-06-01",
        end_date="2026-06-05",
        status=status,
    )
    TripMember.objects.create(
        trip=trip,
        user=captain,
        role=TripRole.CAPTAIN,
        status=MemberStatus.ACTIVE,
    )
    return trip


def _add_member(trip: Trip, user, *, role=TripRole.MEMBER) -> TripMember:
    return TripMember.objects.create(
        trip=trip,
        user=user,
        role=role,
        status=MemberStatus.ACTIVE,
    )


def _make_image_upload() -> SimpleUploadedFile:
    buf = io.BytesIO()
    PILImage.new("RGB", (1200, 900), "navy").save(buf, format="JPEG")
    return SimpleUploadedFile(
        "trip-photo.jpg",
        buf.getvalue(),
        content_type="image/jpeg",
    )


def _make_photo(trip: Trip, uploader, *, index: int) -> TripPhoto:
    return TripPhoto.objects.create(
        trip=trip,
        uploaded_by=uploader,
        original_filename=f"photo-{index}.jpg",
        original_width=1200,
        original_height=900,
        thumbnail=f"trip-photos/{trip.id}/photo-{index}-thumb.webp",
        medium=f"trip-photos/{trip.id}/photo-{index}-medium.webp",
        thumbnail_width=480,
        thumbnail_height=360,
        medium_width=1200,
        medium_height=900,
    )


class TripMemoryMutationConcurrencyTests(TransactionTestCase):
    def setUp(self) -> None:
        self.tempdir = TemporaryDirectory()
        self.override = override_settings(
            MEDIA_ROOT=self.tempdir.name,
            TRIP_MEMORY_MIN_PHOTOS=5,
            TRIP_MEMORY_MAX_PHOTOS=50,
            TRIP_MEMORY_AUTO_PICK_PHOTOS=20,
            TRIP_PHOTO_MAX_BYTES=10 * 1024 * 1024,
            TRIP_PHOTO_MAX_SOURCE_PIXELS=45_000_000,
            TRIP_PHOTO_THUMBNAIL_MAX_EDGE=480,
            TRIP_PHOTO_MEDIUM_MAX_EDGE=2560,
            TRIP_PHOTO_WEBP_QUALITY=84,
            TRIP_PHOTO_MAX_FILES_PER_UPLOAD=20,
            TRIP_PHOTO_MAX_UPLOAD_BYTES=50 * 1024 * 1024,
            TRIP_PHOTO_MAX_UPLOAD_SOURCE_PIXELS=90_000_000,
            TRIP_PHOTO_MAX_DECODED_BYTES=160 * 1024 * 1024,
        )
        self.override.enable()
        self.captain = create_completed_user(
            "memory-race-cap@example.com",
            "memoryracecap",
            "MRC001",
        )
        self.member = create_completed_user(
            "memory-race-member@example.com",
            "memoryracemem",
            "MRM001",
        )
        self.trip = _make_trip(self.captain)
        _add_member(self.trip, self.member)

    def tearDown(self) -> None:
        self.override.disable()
        self.tempdir.cleanup()

    def _run_in_thread(self, target):
        outcome = {}

        def runner():
            close_old_connections()
            try:
                outcome["value"] = target()
            except Exception as exc:  # pragma: no cover - asserted by caller
                outcome["error"] = exc
            finally:
                close_old_connections()
                connections.close_all()

        thread = threading.Thread(target=runner)
        thread.start()
        return thread, outcome

    def _start_cancel_transition(self):
        transition_started = threading.Event()
        allow_commit = threading.Event()

        def cancel_trip_worker():
            with transaction.atomic():
                locked_trip = Trip.objects.select_for_update().get(pk=self.trip.pk)
                locked_trip.status = TripStatus.CANCELLED
                locked_trip.save(update_fields=["status"])
                transition_started.set()
                if not allow_commit.wait(timeout=5):
                    raise AssertionError("Timed out waiting to commit cancelled trip.")

        close_thread, close_outcome = self._run_in_thread(cancel_trip_worker)
        self.assertTrue(transition_started.wait(timeout=5))
        return allow_commit, close_thread, close_outcome

    def test_create_trip_photos_waits_for_cancelled_trip_transition(self):
        allow_commit, close_thread, close_outcome = self._start_cancel_transition()

        create_thread, create_outcome = self._run_in_thread(
            lambda: create_trip_photos(
                trip_id=self.trip.id,
                actor=self.member,
                files=[_make_image_upload()],
            )
        )

        time.sleep(0.2)
        self.assertTrue(create_thread.is_alive())

        allow_commit.set()
        create_thread.join(timeout=5)
        close_thread.join(timeout=5)

        self.assertFalse(close_thread.is_alive())
        self.assertIsNone(close_outcome.get("error"))
        self.assertFalse(create_thread.is_alive())
        self.assertIsInstance(create_outcome.get("error"), TripTerminalError)
        self.assertEqual(TripPhoto.objects.count(), 0)

    def test_create_trip_memory_video_waits_for_cancelled_trip_transition(self):
        photos = [_make_photo(self.trip, self.member, index=index) for index in range(5)]
        allow_commit, close_thread, close_outcome = self._start_cancel_transition()

        with patch(
            "memories.memory_video_services.render_trip_memory_video_task.apply_async"
        ) as enqueue:
            create_thread, create_outcome = self._run_in_thread(
                lambda: create_trip_memory_video(
                    trip_id=self.trip.id,
                    actor=self.member,
                    title="Race recap",
                    source_mode=TripMemoryVideoSourceMode.MANUAL,
                    photo_ids=[photo.id for photo in photos],
                )
            )

            time.sleep(0.2)
            self.assertTrue(create_thread.is_alive())

            allow_commit.set()
            create_thread.join(timeout=5)

        close_thread.join(timeout=5)

        self.assertFalse(close_thread.is_alive())
        self.assertIsNone(close_outcome.get("error"))
        self.assertFalse(create_thread.is_alive())
        self.assertIsInstance(create_outcome.get("error"), TripTerminalError)
        self.assertEqual(TripMemoryVideo.objects.count(), 0)
        enqueue.assert_not_called()
