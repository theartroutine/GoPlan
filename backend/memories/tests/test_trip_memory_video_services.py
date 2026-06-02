from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.files.base import ContentFile
from django.db import IntegrityError
from django.test import TestCase, override_settings

from memories.memory_video_services import (
    MemoryVideoDeleteBlockedError,
    MemoryVideoNotReadyError,
    MemoryVideoPermissionError,
    MemoryVideoValidationError,
    create_trip_memory_video,
    delete_trip_memory_video,
    disable_memory_share_link,
    enable_memory_share_link,
    get_memory_music_track,
    list_memory_music_tracks,
    select_auto_pick_photos,
    update_trip_memory_video,
)
from memories.models import (
    TripMemoryVideo,
    TripMemoryVideoSourceMode,
    TripMemoryVideoStatus,
    TripPhoto,
)
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus
from trips.services import TripNotFoundError, TripTerminalError

MUSIC_KEY = "life-of-riley"


def _make_trip(captain, *, status=TripStatus.PLANNING, name="Memory Trip") -> Trip:
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


def _make_photo(trip: Trip, uploader, *, index: int, medium: str | None = None) -> TripPhoto:
    return TripPhoto.objects.create(
        trip=trip,
        uploaded_by=uploader,
        original_filename=f"photo-{index}.jpg",
        original_width=1200,
        original_height=900,
        thumbnail=f"trip-photos/{trip.id}/photo-{index}-thumb.webp",
        medium=medium if medium is not None else f"trip-photos/{trip.id}/photo-{index}-medium.webp",
        thumbnail_width=480,
        thumbnail_height=360,
        medium_width=1200,
        medium_height=900,
    )


class TripMemoryVideoServiceTests(TestCase):
    def setUp(self) -> None:
        self.tempdir = TemporaryDirectory()
        self.override = override_settings(
            MEDIA_ROOT=self.tempdir.name,
            TRIP_MEMORY_MIN_PHOTOS=5,
            TRIP_MEMORY_MAX_PHOTOS=50,
            TRIP_MEMORY_AUTO_PICK_PHOTOS=20,
        )
        self.override.enable()
        self.captain = create_completed_user("memory-cap@example.com", "memorycap", "MVC001")
        self.member = create_completed_user("memory-member@example.com", "memorymem", "MVM001")
        self.other_member = create_completed_user("memory-other@example.com", "memoryoth", "MVO001")
        self.outsider = create_completed_user("memory-outsider@example.com", "memoryout", "MVO999")
        self.trip = _make_trip(self.captain)
        _add_member(self.trip, self.member)
        _add_member(self.trip, self.other_member)

    def tearDown(self) -> None:
        self.override.disable()
        self.tempdir.cleanup()

    def _photos(self, count: int, *, trip: Trip | None = None) -> list[TripPhoto]:
        target_trip = trip or self.trip
        return [_make_photo(target_trip, self.member, index=index) for index in range(count)]

    def test_member_creates_manual_memory_with_five_photos(self):
        photos = self._photos(5)

        memory = create_trip_memory_video(
            trip_id=self.trip.id,
            actor=self.member,
            title="Summer recap",
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            photo_ids=[photo.id for photo in photos],
        )

        self.assertEqual(memory.trip_id, self.trip.id)
        self.assertEqual(memory.created_by_id, self.member.id)
        self.assertEqual(memory.created_by_display_name_snapshot, self.member.display_name)
        self.assertEqual(memory.status, TripMemoryVideoStatus.QUEUED)
        self.assertEqual(memory.source_mode, TripMemoryVideoSourceMode.MANUAL)
        self.assertEqual(memory.source_photo_ids, [str(photo.id) for photo in photos])
        self.assertEqual(memory.source_photo_count, 5)
        self.assertIsNotNone(get_memory_music_track(memory.music_key))

    def test_music_catalog_exposes_audible_tracks_not_silent_placeholder(self):
        tracks = list_memory_music_tracks()

        self.assertGreaterEqual(len(tracks), 7)
        self.assertNotIn("silent-placeholder", {track.key for track in tracks})
        self.assertTrue(all(track.enabled for track in tracks))
        self.assertTrue(all(not track.placeholder for track in tracks))
        # Only redistribution-safe licenses are allowed; CC-BY tracks must also
        # carry the attribution data the serializer surfaces to listeners.
        for track in tracks:
            self.assertIn(track.license, {"CC0 1.0", "CC-BY 4.0"})
            if track.license == "CC-BY 4.0":
                self.assertTrue(track.artist)
                self.assertTrue(track.license_url)
                self.assertTrue(track.source_url)

    @patch("memories.memory_video_services.secrets.choice")
    def test_create_memory_randomly_assigns_music_when_key_is_omitted(self, choice):
        selected_track = get_memory_music_track("carefree")
        self.assertIsNotNone(selected_track)
        choice.return_value = selected_track
        photos = self._photos(5)

        memory = create_trip_memory_video(
            trip_id=self.trip.id,
            actor=self.member,
            title="Random music recap",
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            photo_ids=[photo.id for photo in photos],
        )

        choice.assert_called_once()
        self.assertEqual(memory.music_key, "carefree")

    def test_manual_create_rejects_fewer_than_five_photos(self):
        photos = self._photos(4)

        with self.assertRaises(MemoryVideoValidationError) as ctx:
            create_trip_memory_video(
                trip_id=self.trip.id,
                actor=self.member,
                title="Too short",
                source_mode=TripMemoryVideoSourceMode.MANUAL,
                photo_ids=[photo.id for photo in photos],
            )

        self.assertEqual(ctx.exception.error_code, "MEMORY_INVALID_PHOTO_SELECTION")

    def test_manual_create_rejects_more_than_fifty_photos(self):
        photos = self._photos(51)

        with self.assertRaises(MemoryVideoValidationError) as ctx:
            create_trip_memory_video(
                trip_id=self.trip.id,
                actor=self.member,
                title="Too long",
                source_mode=TripMemoryVideoSourceMode.MANUAL,
                photo_ids=[photo.id for photo in photos],
            )

        self.assertEqual(ctx.exception.error_code, "MEMORY_INVALID_PHOTO_SELECTION")

    def test_manual_create_rejects_duplicate_photo_ids(self):
        photos = self._photos(5)
        photo_ids = [photo.id for photo in photos]
        photo_ids[-1] = photo_ids[0]

        with self.assertRaises(MemoryVideoValidationError) as ctx:
            create_trip_memory_video(
                trip_id=self.trip.id,
                actor=self.member,
                title="Duplicate",
                source_mode=TripMemoryVideoSourceMode.MANUAL,
                photo_ids=photo_ids,
            )

        self.assertEqual(ctx.exception.error_code, "MEMORY_INVALID_PHOTO_SELECTION")

    def test_manual_create_rejects_photo_from_other_trip(self):
        other_trip = _make_trip(self.outsider, name="Other Trip")
        photos = self._photos(4)
        other_photo = _make_photo(other_trip, self.outsider, index=99)

        with self.assertRaises(MemoryVideoValidationError) as ctx:
            create_trip_memory_video(
                trip_id=self.trip.id,
                actor=self.member,
                title="Mixed trip",
                source_mode=TripMemoryVideoSourceMode.MANUAL,
                photo_ids=[photo.id for photo in photos] + [other_photo.id],
            )

        self.assertEqual(ctx.exception.error_code, "MEMORY_INVALID_PHOTO_SELECTION")

    def test_manual_create_rejects_photo_without_usable_medium_asset(self):
        photos = self._photos(4)
        unusable_photo = _make_photo(self.trip, self.member, index=99, medium="")

        with self.assertRaises(MemoryVideoValidationError) as ctx:
            create_trip_memory_video(
                trip_id=self.trip.id,
                actor=self.member,
                title="Unusable photo",
                source_mode=TripMemoryVideoSourceMode.MANUAL,
                photo_ids=[photo.id for photo in photos] + [unusable_photo.id],
            )

        self.assertEqual(ctx.exception.error_code, "MEMORY_INVALID_PHOTO_SELECTION")

    def test_auto_pick_rejects_trip_with_fewer_than_five_usable_photos(self):
        self._photos(4)

        with self.assertRaises(MemoryVideoValidationError) as ctx:
            select_auto_pick_photos(trip_id=self.trip.id, actor=self.member)

        self.assertEqual(ctx.exception.error_code, "MEMORY_INVALID_PHOTO_SELECTION")

    def test_auto_pick_uses_all_photos_when_count_is_between_five_and_twenty(self):
        photos = self._photos(7)

        selected = select_auto_pick_photos(trip_id=self.trip.id, actor=self.member)

        self.assertEqual([photo.id for photo in selected], [photo.id for photo in photos])

    def test_auto_pick_caps_selection_at_twenty_photos(self):
        photos = self._photos(25)

        selected = select_auto_pick_photos(trip_id=self.trip.id, actor=self.member)

        self.assertEqual(len(selected), 20)
        self.assertEqual(len({photo.id for photo in selected}), 20)
        self.assertEqual(selected[0].id, photos[0].id)
        self.assertEqual(selected[-1].id, photos[-1].id)

    def test_completed_trip_allows_memory_creation(self):
        self.trip.status = TripStatus.COMPLETED
        self.trip.save(update_fields=["status"])
        photos = self._photos(5)

        memory = create_trip_memory_video(
            trip_id=self.trip.id,
            actor=self.member,
            title="Completed recap",
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            photo_ids=[photo.id for photo in photos],
        )

        self.assertEqual(memory.status, TripMemoryVideoStatus.QUEUED)

    def test_cancelled_trip_rejects_memory_creation(self):
        self.trip.status = TripStatus.CANCELLED
        self.trip.save(update_fields=["status"])
        photos = self._photos(5)

        with self.assertRaises(TripTerminalError) as ctx:
            create_trip_memory_video(
                trip_id=self.trip.id,
                actor=self.member,
                title="Cancelled recap",
                source_mode=TripMemoryVideoSourceMode.MANUAL,
                photo_ids=[photo.id for photo in photos],
            )

        self.assertEqual(ctx.exception.error_code, "TRIP_TERMINAL")

    def test_non_member_create_checks_membership_before_music_validation(self):
        photos = self._photos(5)

        with self.assertRaises(TripNotFoundError) as ctx:
            create_trip_memory_video(
                trip_id=self.trip.id,
                actor=self.outsider,
                title="Outsider recap",
                source_mode=TripMemoryVideoSourceMode.MANUAL,
                photo_ids=[photo.id for photo in photos],
            )

        self.assertEqual(ctx.exception.error_code, "TRIP_NOT_FOUND")

    def test_member_cannot_create_second_active_memory_for_same_trip(self):
        photos = self._photos(5)
        create_trip_memory_video(
            trip_id=self.trip.id,
            actor=self.member,
            title="First recap",
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            photo_ids=[photo.id for photo in photos],
        )

        with self.assertRaises(MemoryVideoValidationError) as ctx:
            create_trip_memory_video(
                trip_id=self.trip.id,
                actor=self.member,
                title="Second recap",
                source_mode=TripMemoryVideoSourceMode.MANUAL,
                photo_ids=[photo.id for photo in photos],
            )

        self.assertEqual(ctx.exception.error_code, "MEMORY_RENDER_ALREADY_RUNNING")

    def test_trip_cannot_exceed_active_memory_quota(self):
        photos = self._photos(5)

        with self.settings(
            TRIP_MEMORY_MAX_ACTIVE_PER_USER_PER_TRIP=5,
            TRIP_MEMORY_MAX_ACTIVE_PER_TRIP=3,
        ):
            for actor in [self.member, self.other_member, self.captain]:
                create_trip_memory_video(
                    trip_id=self.trip.id,
                    actor=actor,
                        title=f"{actor.display_name} recap",
                        source_mode=TripMemoryVideoSourceMode.MANUAL,
                        photo_ids=[photo.id for photo in photos],
                    )

            with self.assertRaises(MemoryVideoValidationError) as ctx:
                create_trip_memory_video(
                    trip_id=self.trip.id,
                    actor=self.member,
                    title="Fourth recap",
                    source_mode=TripMemoryVideoSourceMode.MANUAL,
                    photo_ids=[photo.id for photo in photos],
                )

        self.assertEqual(ctx.exception.error_code, "MEMORY_RENDER_TRIP_LIMIT_REACHED")

    def test_creator_can_manage_own_memory(self):
        memory = TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.member,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            music_key=MUSIC_KEY,
        )

        updated = update_trip_memory_video(
            trip_id=self.trip.id,
            memory_id=memory.id,
            actor=self.member,
            title="Creator title",
        )

        self.assertEqual(updated.title, "Creator title")

    def test_captain_can_manage_member_memory(self):
        memory = TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.member,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            music_key=MUSIC_KEY,
        )

        updated = update_trip_memory_video(
            trip_id=self.trip.id,
            memory_id=memory.id,
            actor=self.captain,
            title="Captain title",
        )

        self.assertEqual(updated.title, "Captain title")

    def test_member_cannot_manage_other_member_memory(self):
        memory = TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.member,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            music_key=MUSIC_KEY,
        )

        with self.assertRaises(MemoryVideoPermissionError) as ctx:
            update_trip_memory_video(
                trip_id=self.trip.id,
                memory_id=memory.id,
                actor=self.other_member,
                title="Blocked title",
            )

        self.assertEqual(ctx.exception.error_code, "MEMORY_FORBIDDEN")

    def test_delete_blocks_queued_and_rendering_memory(self):
        for video_status in [TripMemoryVideoStatus.QUEUED, TripMemoryVideoStatus.RENDERING]:
            memory = TripMemoryVideo.objects.create(
                trip=self.trip,
                created_by=self.member,
                status=video_status,
                source_mode=TripMemoryVideoSourceMode.MANUAL,
                source_photo_ids=[],
                music_key=MUSIC_KEY,
            )

            with self.assertRaises(MemoryVideoDeleteBlockedError) as ctx:
                delete_trip_memory_video(
                    trip_id=self.trip.id,
                    memory_id=memory.id,
                    actor=self.member,
                )

            self.assertEqual(ctx.exception.error_code, "MEMORY_DELETE_BLOCKED")
            self.assertTrue(TripMemoryVideo.objects.filter(pk=memory.id).exists())

    def test_delete_ready_memory_removes_db_row_and_file_fields_best_effort(self):
        memory = TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.member,
            status=TripMemoryVideoStatus.READY,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            music_key=MUSIC_KEY,
        )
        memory.video_file.save("video.mp4", ContentFile(b"video"), save=True)
        memory.poster_file.save("poster.webp", ContentFile(b"poster"), save=True)
        video_path = Path(memory.video_file.path)
        poster_path = Path(memory.poster_file.path)

        delete_trip_memory_video(
            trip_id=self.trip.id,
            memory_id=memory.id,
            actor=self.member,
        )

        self.assertFalse(TripMemoryVideo.objects.filter(pk=memory.id).exists())
        self.assertFalse(video_path.exists())
        self.assertFalse(poster_path.exists())

    def test_delete_failed_memory_removes_db_row_and_file_fields_best_effort(self):
        memory = TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.member,
            status=TripMemoryVideoStatus.FAILED,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            music_key=MUSIC_KEY,
        )
        memory.video_file.save("failed-video.mp4", ContentFile(b"video"), save=True)
        memory.poster_file.save("failed-poster.webp", ContentFile(b"poster"), save=True)
        video_path = Path(memory.video_file.path)
        poster_path = Path(memory.poster_file.path)

        delete_trip_memory_video(
            trip_id=self.trip.id,
            memory_id=memory.id,
            actor=self.member,
        )

        self.assertFalse(TripMemoryVideo.objects.filter(pk=memory.id).exists())
        self.assertFalse(video_path.exists())
        self.assertFalse(poster_path.exists())

    def test_cancelled_trip_rejects_delete_and_share_mutations(self):
        memory = TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.member,
            status=TripMemoryVideoStatus.READY,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            music_key=MUSIC_KEY,
        )
        self.trip.status = TripStatus.CANCELLED
        self.trip.save(update_fields=["status"])

        with self.assertRaises(TripTerminalError):
            delete_trip_memory_video(
                trip_id=self.trip.id,
                memory_id=memory.id,
                actor=self.member,
            )
        with self.assertRaises(TripTerminalError):
            enable_memory_share_link(
                trip_id=self.trip.id,
                memory_id=memory.id,
                actor=self.member,
                public_base_url="http://testserver",
            )
        with self.assertRaises(TripTerminalError):
            disable_memory_share_link(
                trip_id=self.trip.id,
                memory_id=memory.id,
                actor=self.member,
            )

    def test_enable_share_link_retries_when_unique_slug_save_collides(self):
        memory = TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.member,
            status=TripMemoryVideoStatus.READY,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            music_key=MUSIC_KEY,
        )
        memory.video_file.save("video.mp4", ContentFile(b"video"), save=True)
        memory.poster_file.save("poster.webp", ContentFile(b"poster"), save=True)
        original_save = TripMemoryVideo.save
        attempts = {"count": 0}

        def flaky_save(instance, *args, **kwargs):
            update_fields = kwargs.get("update_fields") or []
            if "share_slug" in update_fields and attempts["count"] == 0:
                attempts["count"] += 1
                raise IntegrityError("duplicate key value violates unique constraint")
            return original_save(instance, *args, **kwargs)

        with (
            patch(
                "memories.memory_video_services._generate_share_slug",
                side_effect=["collision-slug", "retry-slug"],
            ),
            patch.object(TripMemoryVideo, "save", flaky_save),
        ):
            updated, url = enable_memory_share_link(
                trip_id=self.trip.id,
                memory_id=memory.id,
                actor=self.member,
                public_base_url="http://testserver",
            )

        self.assertEqual(attempts["count"], 1)
        self.assertEqual(updated.share_slug, "retry-slug")
        self.assertEqual(url, "http://testserver/share/memories/retry-slug")
        memory.refresh_from_db()
        self.assertEqual(memory.share_slug, "retry-slug")
        self.assertTrue(memory.share_enabled)

    def test_enable_share_link_requires_ready_memory_with_files(self):
        for video_status in [TripMemoryVideoStatus.QUEUED, TripMemoryVideoStatus.RENDERING, TripMemoryVideoStatus.FAILED]:
            with self.subTest(video_status=video_status):
                memory = TripMemoryVideo.objects.create(
                    trip=self.trip,
                    created_by=self.member,
                    status=video_status,
                    source_mode=TripMemoryVideoSourceMode.MANUAL,
                    source_photo_ids=[],
                    music_key=MUSIC_KEY,
                )

                with self.assertRaises(MemoryVideoNotReadyError) as ctx:
                    enable_memory_share_link(
                        trip_id=self.trip.id,
                        memory_id=memory.id,
                        actor=self.member,
                        public_base_url="http://testserver",
                    )

                self.assertEqual(ctx.exception.error_code, "MEMORY_NOT_READY")

        ready_without_files = TripMemoryVideo.objects.create(
            trip=self.trip,
            created_by=self.member,
            status=TripMemoryVideoStatus.READY,
            source_mode=TripMemoryVideoSourceMode.MANUAL,
            source_photo_ids=[],
            music_key=MUSIC_KEY,
        )

        with self.assertRaises(MemoryVideoNotReadyError):
            enable_memory_share_link(
                trip_id=self.trip.id,
                memory_id=ready_without_files.id,
                actor=self.member,
                public_base_url="http://testserver",
            )
