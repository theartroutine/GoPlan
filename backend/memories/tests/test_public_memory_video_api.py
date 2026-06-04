from __future__ import annotations

from tempfile import TemporaryDirectory

from django.core.files.base import ContentFile
from django.test import override_settings
from rest_framework.test import APITestCase

from memories.models import (
    TripMemoryVideo,
    TripMemoryVideoSourceMode,
    TripMemoryVideoStatus,
)
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus


def _make_trip(captain, *, name="Public Memory Trip") -> Trip:
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


def _public_memory_url(slug: str) -> str:
    return f"/api/public/memories/{slug}"


def _public_memory_asset_url(slug: str, variant: str) -> str:
    return f"/api/public/memories/{slug}/{variant}"


def _response_body(response) -> bytes:
    if hasattr(response, "streaming_content"):
        return b"".join(response.streaming_content)
    return response.content


class PublicTripMemoryVideoAPITests(APITestCase):
    def setUp(self) -> None:
        self.tempdir = TemporaryDirectory()
        self.override = override_settings(MEDIA_ROOT=self.tempdir.name)
        self.override.enable()
        self.captain = create_completed_user(
            "public-memory-cap@example.com",
            "publicmemorycap",
            "PMC001",
        )
        self.trip = _make_trip(self.captain)

    def tearDown(self) -> None:
        self.override.disable()
        self.tempdir.cleanup()

    def _memory(
        self,
        *,
        slug: str = "public-ready-slug",
        share_enabled: bool = True,
        status: str = TripMemoryVideoStatus.READY,
        with_files: bool = True,
    ) -> TripMemoryVideo:
        memory = TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.captain,
            title="Da Nang recap",
            status=status,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            source_photo_count=7,
            music_key="silent-placeholder",
            duration_seconds=42,
            share_enabled=share_enabled,
            share_slug=slug,
        )
        if with_files:
            memory.video_file.save("video.mp4", ContentFile(b"0123456789"), save=False)
            memory.poster_file.save("poster.webp", ContentFile(b"WEBP"), save=True)
        return memory

    def test_enabled_ready_public_metadata_returns_safe_urls(self):
        self._memory(slug="ready-share")

        response = self.client.get(_public_memory_url("ready-share"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data,
            {
                "title": "Da Nang recap",
                "poster_url": "/api/public/memories/ready-share/poster",
                "video_url": "/api/public/memories/ready-share/video",
                "duration_seconds": 42,
                "source_photo_count": 7,
                "music": None,
            },
        )
        self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_cc0_track_exposes_music_provenance_to_public_viewers(self):
        memory = self._memory(slug="credited-share")
        memory.music_key = "sunrise-road"
        memory.save(update_fields=["music_key"])

        response = self.client.get(_public_memory_url("credited-share"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["music"],
            {
                "title": "Introduction to your adventure",
                "artist": "Komiku",
                "license": "CC0 1.0",
                "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
                "source_url": "https://commons.wikimedia.org/wiki/File:Komiku_-_01_-_Introduction_to_your_adventure.ogg",
            },
        )

    def test_disabled_share_returns_404(self):
        self._memory(slug="disabled-share", share_enabled=False)

        response = self.client.get(_public_memory_url("disabled-share"))

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["error_code"], "MEMORY_NOT_FOUND")

    def test_failed_memory_returns_404(self):
        self._memory(slug="failed-share", status=TripMemoryVideoStatus.FAILED)

        response = self.client.get(_public_memory_url("failed-share"))

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["error_code"], "MEMORY_NOT_FOUND")

    def test_queued_and_rendering_memories_return_404(self):
        for video_status in [
            TripMemoryVideoStatus.QUEUED,
            TripMemoryVideoStatus.RENDERING,
        ]:
            with self.subTest(video_status=video_status):
                slug = f"{video_status}-share"
                self._memory(slug=slug, status=video_status)

                response = self.client.get(_public_memory_url(slug))

                self.assertEqual(response.status_code, 404)
                self.assertEqual(response.data["error_code"], "MEMORY_NOT_FOUND")

    def test_unknown_slug_returns_404(self):
        response = self.client.get(_public_memory_url("missing-share"))

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["error_code"], "MEMORY_NOT_FOUND")

    def test_missing_public_files_return_404(self):
        self._memory(slug="missing-files", with_files=False)

        detail_response = self.client.get(_public_memory_url("missing-files"))
        video_response = self.client.get(_public_memory_asset_url("missing-files", "video"))
        poster_response = self.client.get(_public_memory_asset_url("missing-files", "poster"))

        self.assertEqual(detail_response.status_code, 404)
        self.assertEqual(video_response.status_code, 404)
        self.assertEqual(poster_response.status_code, 404)

    def test_public_video_with_range_returns_206(self):
        self._memory(slug="range-share")

        response = self.client.get(
            _public_memory_asset_url("range-share", "video"),
            HTTP_RANGE="bytes=2-5",
        )

        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.headers["Accept-Ranges"], "bytes")
        self.assertEqual(response.headers["Content-Range"], "bytes 2-5/10")
        self.assertEqual(response.headers["Content-Length"], "4")
        self.assertEqual(response.headers["Content-Type"], "video/mp4")
        self.assertEqual(response.headers["Content-Disposition"], "inline")
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(_response_body(response), b"2345")

    def test_public_poster_returns_webp_with_short_cache(self):
        self._memory(slug="poster-share")

        response = self.client.get(_public_memory_asset_url("poster-share", "poster"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Content-Type"], "image/webp")
        self.assertEqual(response.headers["Content-Length"], "4")
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(_response_body(response), b"WEBP")

    def test_public_routes_never_require_authentication(self):
        self._memory(slug="anonymous-share")

        metadata_response = self.client.get(_public_memory_url("anonymous-share"))
        video_response = self.client.get(_public_memory_asset_url("anonymous-share", "video"))
        poster_response = self.client.get(
            _public_memory_asset_url("anonymous-share", "poster"),
            HTTP_AUTHORIZATION="Bearer invalid-token",
        )

        self.assertEqual(metadata_response.status_code, 200)
        self.assertEqual(video_response.status_code, 200)
        self.assertEqual(poster_response.status_code, 200)

    def test_public_metadata_does_not_expose_private_fields(self):
        self._memory(slug="safe-fields")

        response = self.client.get(_public_memory_url("safe-fields"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            set(response.data.keys()),
            {
                "title",
                "poster_url",
                "video_url",
                "duration_seconds",
                "source_photo_count",
                "music",
            },
        )
        forbidden_fields = {
            "id",
            "trip",
            "trip_id",
            "photos",
            "members",
            "created_by",
            "download_url",
            "can_manage",
            "can_download",
            "video_file",
            "poster_file",
            "share_slug",
            "share",
        }
        self.assertTrue(forbidden_fields.isdisjoint(response.data.keys()))
