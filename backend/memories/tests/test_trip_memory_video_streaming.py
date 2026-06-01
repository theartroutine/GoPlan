from __future__ import annotations

from io import BytesIO
from types import SimpleNamespace
from tempfile import TemporaryDirectory

from django.core.files.base import ContentFile
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from memories.memory_video_streaming import range_streaming_response
from memories.models import (
    TripMemoryVideo,
    TripMemoryVideoSourceMode,
    TripMemoryVideoStatus,
)
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus

MUSIC_KEY = "life-of-riley"


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def _make_trip(captain, *, name="Memory Streaming Trip") -> Trip:
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


def _add_member(trip: Trip, user, *, role=TripRole.MEMBER) -> TripMember:
    return TripMember.objects.create(
        trip=trip,
        user=user,
        role=role,
        status=MemberStatus.ACTIVE,
    )


def _video_url(trip_id, memory_id) -> str:
    return f"/api/trips/{trip_id}/memories/{memory_id}/video"


def _download_url(trip_id, memory_id) -> str:
    return f"/api/trips/{trip_id}/memories/{memory_id}/download"


def _poster_url(trip_id, memory_id) -> str:
    return f"/api/trips/{trip_id}/memories/{memory_id}/poster"


def _response_body(response) -> bytes:
    if hasattr(response, "streaming_content"):
        return b"".join(response.streaming_content)
    return response.content


class TripMemoryVideoStreamingAPITests(APITestCase):
    def setUp(self) -> None:
        self.tempdir = TemporaryDirectory()
        self.override = override_settings(MEDIA_ROOT=self.tempdir.name)
        self.override.enable()
        self.captain = create_completed_user(
            "stream-cap@example.com",
            "streamcap",
            "SMC001",
        )
        self.member = create_completed_user(
            "stream-member@example.com",
            "streammem",
            "SMM001",
        )
        self.outsider = create_completed_user(
            "stream-outsider@example.com",
            "streamout",
            "SMO001",
        )
        self.trip = _make_trip(self.captain)
        _add_member(self.trip, self.member)

    def tearDown(self) -> None:
        self.override.disable()
        self.tempdir.cleanup()

    def _ready_memory(self, *, title: str = "Da Nang recap") -> TripMemoryVideo:
        memory = TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.member,
            title=title,
            status=TripMemoryVideoStatus.READY,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            source_photo_count=5,
            music_key=MUSIC_KEY,
        )
        memory.video_file.save("video.mp4", ContentFile(b"0123456789"), save=False)
        memory.poster_file.save("poster.webp", ContentFile(b"WEBP"), save=True)
        return memory

    def test_private_video_without_range_streams_inline_mp4(self):
        memory = self._ready_memory()

        response = self.client.get(_video_url(self.trip.id, memory.id), **_auth(self.member))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Accept-Ranges"], "bytes")
        self.assertEqual(response.headers["Content-Type"], "video/mp4")
        self.assertEqual(response.headers["Content-Length"], "10")
        self.assertEqual(response.headers["Content-Disposition"], "inline")
        self.assertEqual(_response_body(response), b"0123456789")

    def test_private_video_with_byte_range_returns_partial_body(self):
        memory = self._ready_memory()

        response = self.client.get(
            _video_url(self.trip.id, memory.id),
            HTTP_RANGE="bytes=0-3",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.headers["Accept-Ranges"], "bytes")
        self.assertEqual(response.headers["Content-Range"], "bytes 0-3/10")
        self.assertEqual(response.headers["Content-Length"], "4")
        self.assertEqual(response.headers["Content-Type"], "video/mp4")
        self.assertEqual(_response_body(response), b"0123")

    def test_private_video_with_open_ended_range_returns_tail_from_start(self):
        memory = self._ready_memory()

        response = self.client.get(
            _video_url(self.trip.id, memory.id),
            HTTP_RANGE="bytes=4-",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.headers["Content-Range"], "bytes 4-9/10")
        self.assertEqual(response.headers["Content-Length"], "6")
        self.assertEqual(_response_body(response), b"456789")

    def test_private_video_with_suffix_range_returns_requested_suffix(self):
        memory = self._ready_memory()

        response = self.client.get(
            _video_url(self.trip.id, memory.id),
            HTTP_RANGE="bytes=-3",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.headers["Content-Range"], "bytes 7-9/10")
        self.assertEqual(response.headers["Content-Length"], "3")
        self.assertEqual(_response_body(response), b"789")

    def test_private_video_with_invalid_range_returns_416(self):
        memory = self._ready_memory()

        response = self.client.get(
            _video_url(self.trip.id, memory.id),
            HTTP_RANGE="bytes=99-120",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 416)
        self.assertEqual(response.headers["Accept-Ranges"], "bytes")
        self.assertEqual(response.headers["Content-Range"], "bytes */10")
        self.assertEqual(response.headers["Content-Length"], "0")

    def test_private_video_with_huge_start_range_returns_416(self):
        memory = self._ready_memory()

        response = self.client.get(
            _video_url(self.trip.id, memory.id),
            HTTP_RANGE=f"bytes={'9' * 5000}-",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 416)
        self.assertEqual(response.headers["Content-Range"], "bytes */10")

    def test_private_video_with_huge_suffix_range_returns_416(self):
        memory = self._ready_memory()

        response = self.client.get(
            _video_url(self.trip.id, memory.id),
            HTTP_RANGE=f"bytes=-{'9' * 5000}",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 416)
        self.assertEqual(response.headers["Content-Range"], "bytes */10")

    def test_range_response_opens_storage_only_when_body_is_iterated(self):
        class TrackingStorage:
            def __init__(self) -> None:
                self.open_calls = 0

            def open(self, name, mode="rb"):
                self.open_calls += 1
                return BytesIO(b"0123456789")

        storage = TrackingStorage()
        field = SimpleNamespace(size=10, name="video.mp4", storage=storage)

        response = range_streaming_response(
            field=field,
            range_header="bytes=0-3",
            content_type="video/mp4",
            content_disposition="inline",
        )

        self.assertEqual(response.status_code, 206)
        self.assertEqual(storage.open_calls, 0)
        self.assertEqual(_response_body(response), b"0123")
        self.assertEqual(storage.open_calls, 1)

    def test_private_download_uses_attachment_disposition(self):
        memory = self._ready_memory(title='Da Nang / "Best" recap ✨')

        response = self.client.get(
            _download_url(self.trip.id, memory.id),
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Content-Type"], "video/mp4")
        self.assertIn("attachment", response.headers["Content-Disposition"])
        self.assertIn('filename="Da_Nang_Best_recap.mp4"', response.headers["Content-Disposition"])

    def test_not_ready_memory_returns_conflict(self):
        memory = TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.member,
            title="Queued recap",
            status=TripMemoryVideoStatus.QUEUED,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            source_photo_count=5,
            music_key=MUSIC_KEY,
        )

        response = self.client.get(_video_url(self.trip.id, memory.id), **_auth(self.member))

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "MEMORY_NOT_READY")

    def test_ready_memory_with_missing_video_file_returns_not_ready(self):
        memory = TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.member,
            title="Missing file recap",
            status=TripMemoryVideoStatus.READY,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            source_photo_count=5,
            music_key=MUSIC_KEY,
            video_file="trip-memory-videos/missing/video.mp4",
        )

        response = self.client.get(_video_url(self.trip.id, memory.id), **_auth(self.member))

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "MEMORY_NOT_READY")

    def test_non_member_cannot_access_private_asset(self):
        memory = self._ready_memory()

        response = self.client.get(_video_url(self.trip.id, memory.id), **_auth(self.outsider))

        self.assertEqual(response.status_code, 404)

    def test_private_poster_returns_webp_with_private_no_store_cache(self):
        memory = self._ready_memory()

        response = self.client.get(_poster_url(self.trip.id, memory.id), **_auth(self.member))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Content-Type"], "image/webp")
        self.assertEqual(response.headers["Cache-Control"], "private, no-store")
        self.assertEqual(_response_body(response), b"WEBP")
