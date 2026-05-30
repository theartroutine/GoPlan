from __future__ import annotations

from tempfile import TemporaryDirectory

from django.core.files.base import ContentFile
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from memories.models import (
    TripMemoryVideo,
    TripMemoryVideoSourceMode,
    TripMemoryVideoStatus,
    TripPhoto,
)
from memories.serializers import TripMemoryVideoSerializer
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus

MUSIC_KEY = "sunrise-road"


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def _make_trip(captain, *, status=TripStatus.PLANNING, name="Memory API Trip") -> Trip:
    trip = Trip.objects.create(
        created_by=captain,
        name=name,
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


def _memories_url(trip_id) -> str:
    return f"/api/trips/{trip_id}/memories"


def _memory_detail_url(trip_id, memory_id) -> str:
    return f"/api/trips/{trip_id}/memories/{memory_id}"


def _share_link_url(trip_id, memory_id) -> str:
    return f"/api/trips/{trip_id}/memories/{memory_id}/share-link"


def _music_tracks_url(trip_id) -> str:
    return f"/api/trips/{trip_id}/memories/music-tracks"


class TripMemoryVideoAPITests(APITestCase):
    def setUp(self) -> None:
        self.tempdir = TemporaryDirectory()
        self.override = override_settings(
            MEDIA_ROOT=self.tempdir.name,
            PUBLIC_APP_BASE_URL="http://testserver",
            TRIP_MEMORY_MIN_PHOTOS=5,
            TRIP_MEMORY_MAX_PHOTOS=50,
            TRIP_MEMORY_AUTO_PICK_PHOTOS=20,
        )
        self.override.enable()
        self.captain = create_completed_user("api-memory-cap@example.com", "apimemorycap", "AMC001")
        self.member = create_completed_user("api-memory-mem@example.com", "apimemorymem", "AMM001")
        self.other_member = create_completed_user("api-memory-other@example.com", "apimemoryoth", "AMO001")
        self.outsider = create_completed_user("api-memory-outsider@example.com", "apimemoryout", "AMO999")
        self.trip = _make_trip(self.captain)
        _add_member(self.trip, self.member)
        _add_member(self.trip, self.other_member)

    def tearDown(self) -> None:
        self.override.disable()
        self.tempdir.cleanup()

    def _photos(self, count: int) -> list[TripPhoto]:
        return [_make_photo(self.trip, self.member, index=index) for index in range(count)]

    def _save_ready_files(self, memory: TripMemoryVideo) -> TripMemoryVideo:
        memory.video_file.save("video.mp4", ContentFile(b"video"), save=False)
        memory.poster_file.save("poster.webp", ContentFile(b"poster"), save=True)
        return memory

    def test_member_lists_empty_memories(self):
        response = self.client.get(_memories_url(self.trip.id), **_auth(self.member))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])

    def test_non_member_gets_404_listing_memories(self):
        response = self.client.get(_memories_url(self.trip.id), **_auth(self.outsider))

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["error_code"], "TRIP_NOT_FOUND")

    def test_manual_create_returns_201_queued(self):
        photos = self._photos(5)

        response = self.client.post(
            _memories_url(self.trip.id),
            {
                "title": "Trip recap",
                "source_mode": "manual",
                "photo_ids": [str(photo.id) for photo in photos],
            },
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["memory"]["status"], "queued")
        self.assertEqual(response.data["memory"]["source_photo_count"], 5)
        self.assertTrue(response.data["memory"]["music"]["key"])
        self.assertFalse(response.data["memory"]["can_download"])

    def test_memory_response_has_full_phase_one_shape(self):
        photos = self._photos(5)

        response = self.client.post(
            _memories_url(self.trip.id),
            {
                "title": "Shape recap",
                "source_mode": "manual",
                "photo_ids": [str(photo.id) for photo in photos],
                "music_key": MUSIC_KEY,
            },
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 201)
        payload = response.data["memory"]
        self.assertEqual(
            set(payload.keys()),
            {
                "id",
                "trip_id",
                "title",
                "status",
                "source_mode",
                "source_photo_count",
                "music",
                "duration_seconds",
                "created_by",
                "can_manage",
                "can_download",
                "render_error",
                "share",
                "created_at",
                "updated_at",
            },
        )
        self.assertEqual(
            set(payload["music"].keys()),
            {"key", "title", "artist", "license", "license_url", "source_url"},
        )
        self.assertEqual(set(payload["created_by"].keys()), {"id", "display_name"})
        self.assertIsNone(payload["render_error"])
        self.assertEqual(set(payload["share"].keys()), {"enabled", "url"})
        self.assertEqual(payload["trip_id"], str(self.trip.id))
        self.assertEqual(payload["title"], "Shape recap")
        self.assertEqual(payload["created_by"]["id"], str(self.member.id))
        self.assertTrue(payload["can_manage"])

    def test_memory_serializer_uses_trip_id_without_loading_trip_relation(self):
        memory = TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=None,
            status=TripMemoryVideoStatus.READY,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            source_photo_count=5,
            music_key=MUSIC_KEY,
        )
        memory = TripMemoryVideo.objects.only(
            "id",
            "trip_id",
            "created_by_id",
            "created_by_display_name_snapshot",
            "title",
            "status",
            "source_mode",
            "source_photo_count",
            "music_key",
            "duration_seconds",
            "render_error_code",
            "render_error_message",
            "share_enabled",
            "share_slug",
            "created_at",
            "updated_at",
        ).get(pk=memory.pk)
        membership = TripMember.objects.get(trip=self.trip, user=self.member)

        with CaptureQueriesContext(connection) as captured:
            payload = TripMemoryVideoSerializer(
                memory,
                context={
                    "actor": self.member,
                    "membership": membership,
                    "public_base_url": "http://testserver",
                },
            ).data

        self.assertEqual(payload["trip_id"], str(self.trip.id))
        self.assertEqual(len(captured), 0)

    def test_ready_memory_response_sets_can_download_for_active_member(self):
        memory = self._save_ready_files(TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.member,
            status=TripMemoryVideoStatus.READY,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            source_photo_count=5,
            music_key=MUSIC_KEY,
        ))

        response = self.client.get(
            _memory_detail_url(self.trip.id, memory.id),
            **_auth(self.other_member),
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["memory"]["can_download"])
        self.assertFalse(response.data["memory"]["can_manage"])

    def test_auto_create_returns_201_queued_with_selected_count(self):
        self._photos(8)

        response = self.client.post(
            _memories_url(self.trip.id),
            {
                "title": "Auto recap",
                "source_mode": "auto",
            },
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["memory"]["status"], "queued")
        self.assertEqual(response.data["memory"]["source_mode"], "auto")
        self.assertEqual(response.data["memory"]["source_photo_count"], 8)

    def test_invalid_music_returns_400_memory_invalid_music(self):
        photos = self._photos(5)

        response = self.client.post(
            _memories_url(self.trip.id),
            {
                "title": "Invalid music",
                "source_mode": "manual",
                "photo_ids": [str(photo.id) for photo in photos],
                "music_key": "unknown-track",
            },
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error_code"], "MEMORY_INVALID_MUSIC")

    def test_serializer_validation_errors_return_memory_error_envelope(self):
        create_response = self.client.post(
            _memories_url(self.trip.id),
            {
                "title": "Missing source mode",
                "music_key": MUSIC_KEY,
            },
            format="json",
            **_auth(self.member),
        )
        uuid_response = self.client.post(
            _memories_url(self.trip.id),
            {
                "title": "Invalid UUID",
                "source_mode": "manual",
                "photo_ids": ["not-a-uuid"],
                "music_key": MUSIC_KEY,
            },
            format="json",
            **_auth(self.member),
        )
        memory = TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.member,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            music_key=MUSIC_KEY,
        )
        patch_response = self.client.patch(
            _memory_detail_url(self.trip.id, memory.id),
            {"title": "x" * 121},
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(create_response.status_code, 400)
        self.assertEqual(set(create_response.data.keys()), {"detail", "error_code"})
        self.assertEqual(create_response.data["error_code"], "MEMORY_INVALID_SOURCE_MODE")
        self.assertEqual(uuid_response.status_code, 400)
        self.assertEqual(set(uuid_response.data.keys()), {"detail", "error_code"})
        self.assertEqual(uuid_response.data["error_code"], "MEMORY_INVALID_PHOTO_SELECTION")
        self.assertEqual(patch_response.status_code, 400)
        self.assertEqual(set(patch_response.data.keys()), {"detail", "error_code"})
        self.assertEqual(patch_response.data["error_code"], "MEMORY_INVALID_REQUEST")

    def test_cancelled_trip_rejects_create(self):
        self.trip.status = TripStatus.CANCELLED
        self.trip.save(update_fields=["status"])
        photos = self._photos(5)

        response = self.client.post(
            _memories_url(self.trip.id),
            {
                "title": "Cancelled recap",
                "source_mode": "manual",
                "photo_ids": [str(photo.id) for photo in photos],
                "music_key": MUSIC_KEY,
            },
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "TRIP_TERMINAL")

    def test_creator_and_captain_can_patch_title(self):
        memory = TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.member,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            music_key=MUSIC_KEY,
        )

        creator_response = self.client.patch(
            _memory_detail_url(self.trip.id, memory.id),
            {"title": "Creator title"},
            format="json",
            **_auth(self.member),
        )
        captain_response = self.client.patch(
            _memory_detail_url(self.trip.id, memory.id),
            {"title": "Captain title"},
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(creator_response.status_code, 200)
        self.assertEqual(creator_response.data["memory"]["title"], "Creator title")
        self.assertEqual(captain_response.status_code, 200)
        self.assertEqual(captain_response.data["memory"]["title"], "Captain title")

    def test_non_creator_member_cannot_patch_delete_or_share(self):
        memory = TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.member,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            music_key=MUSIC_KEY,
        )

        patch_response = self.client.patch(
            _memory_detail_url(self.trip.id, memory.id),
            {"title": "Blocked"},
            format="json",
            **_auth(self.other_member),
        )
        delete_response = self.client.delete(
            _memory_detail_url(self.trip.id, memory.id),
            **_auth(self.other_member),
        )
        share_response = self.client.post(
            _share_link_url(self.trip.id, memory.id),
            {},
            format="json",
            **_auth(self.other_member),
        )

        self.assertEqual(patch_response.status_code, 403)
        self.assertEqual(delete_response.status_code, 403)
        self.assertEqual(share_response.status_code, 403)
        self.assertEqual(patch_response.data["error_code"], "MEMORY_FORBIDDEN")
        self.assertEqual(delete_response.data["error_code"], "MEMORY_FORBIDDEN")
        self.assertEqual(share_response.data["error_code"], "MEMORY_FORBIDDEN")

    def test_queued_rendering_delete_returns_409_memory_delete_blocked(self):
        for video_status in [TripMemoryVideoStatus.QUEUED, TripMemoryVideoStatus.RENDERING]:
            memory = TripMemoryVideo.objects.create(
                trip=self.trip,
                created_by=self.member,
                status=video_status,
                source_mode=TripMemoryVideoSourceMode.MANUAL,
                source_photo_ids=[],
                music_key=MUSIC_KEY,
            )

            response = self.client.delete(
                _memory_detail_url(self.trip.id, memory.id),
                **_auth(self.member),
            )

            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.data["error_code"], "MEMORY_DELETE_BLOCKED")

    def test_cancelled_trip_rejects_delete_and_share_mutations(self):
        memory = self._save_ready_files(TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.member,
            status=TripMemoryVideoStatus.READY,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            music_key=MUSIC_KEY,
        ))
        self.trip.status = TripStatus.CANCELLED
        self.trip.save(update_fields=["status"])

        delete_response = self.client.delete(
            _memory_detail_url(self.trip.id, memory.id),
            **_auth(self.member),
        )
        share_enable_response = self.client.post(
            _share_link_url(self.trip.id, memory.id),
            {},
            format="json",
            **_auth(self.member),
        )
        share_disable_response = self.client.delete(
            _share_link_url(self.trip.id, memory.id),
            **_auth(self.member),
        )

        self.assertEqual(delete_response.status_code, 409)
        self.assertEqual(delete_response.data["error_code"], "TRIP_TERMINAL")
        self.assertEqual(share_enable_response.status_code, 409)
        self.assertEqual(share_enable_response.data["error_code"], "TRIP_TERMINAL")
        self.assertEqual(share_disable_response.status_code, 409)
        self.assertEqual(share_disable_response.data["error_code"], "TRIP_TERMINAL")

    def test_share_link_post_enables_share_and_returns_url(self):
        memory = self._save_ready_files(TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.member,
            status=TripMemoryVideoStatus.READY,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            music_key=MUSIC_KEY,
        ))

        response = self.client.post(
            _share_link_url(self.trip.id, memory.id),
            {},
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["share"]["enabled"])
        self.assertTrue(response.data["share"]["url"].startswith("http://testserver/share/memories/"))
        memory.refresh_from_db()
        self.assertTrue(memory.share_enabled)
        self.assertTrue(memory.share_slug)
        self.assertIsNotNone(memory.share_created_at)

    def test_share_link_delete_disables_share(self):
        memory = TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.member,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            music_key=MUSIC_KEY,
            share_enabled=True,
            share_slug="existing-share-slug",
        )

        response = self.client.delete(
            _share_link_url(self.trip.id, memory.id),
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["share"]["enabled"])
        self.assertIsNone(response.data["share"]["url"])
        memory.refresh_from_db()
        self.assertFalse(memory.share_enabled)
        self.assertIsNone(memory.share_slug)
        self.assertIsNone(memory.share_created_at)

    def test_music_tracks_route_returns_audible_catalog(self):
        response = self.client.get(_music_tracks_url(self.trip.id), **_auth(self.member))

        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.data["tracks"]), 7)
        self.assertNotIn(
            "silent-placeholder",
            {track["key"] for track in response.data["tracks"]},
        )
        self.assertTrue(all(track["license"] == "CC0 1.0" for track in response.data["tracks"]))

    def test_failed_memory_response_includes_render_error(self):
        memory = TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.member,
            status=TripMemoryVideoStatus.FAILED,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            source_photo_count=5,
            music_key=MUSIC_KEY,
            render_error_code="MEMORY_SOURCE_UNAVAILABLE",
            render_error_message="A source photo file is missing.",
        )

        response = self.client.get(
            _memory_detail_url(self.trip.id, memory.id),
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["memory"]["render_error"],
            {
                "code": "MEMORY_SOURCE_UNAVAILABLE",
                "message": "A source photo file is missing.",
            },
        )

    def test_share_link_post_rejects_not_ready_memory(self):
        memory = TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.member,
            status=TripMemoryVideoStatus.QUEUED,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            music_key=MUSIC_KEY,
        )

        response = self.client.post(
            _share_link_url(self.trip.id, memory.id),
            {},
            format="json",
            **_auth(self.member),
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "MEMORY_NOT_READY")
