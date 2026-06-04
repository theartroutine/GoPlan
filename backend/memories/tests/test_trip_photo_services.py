from __future__ import annotations

import io
import inspect
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.conf import settings
from django.test import SimpleTestCase, TestCase, override_settings
from PIL import Image as PILImage

from memories.models import TripPhoto
import memories.services as trip_photo_services
from memories.services import (
    TripPhotoStorageError,
    TripPhotoValidationError,
    create_trip_photos,
    delete_trip_photo,
)
from test_helpers import create_completed_user
from trips.models import MemberStatus, Trip, TripMember, TripRole, TripStatus


def _make_trip(captain, *, status=TripStatus.PLANNING) -> Trip:
    trip = Trip.objects.create(
        created_by=captain,
        name="Photo Trip",
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


def _make_image_upload(
    *,
    fmt: str = "JPEG",
    size: tuple[int, int] = (1200, 900),
    color: str = "navy",
    filename: str | None = None,
    exif: PILImage.Exif | None = None,
) -> SimpleUploadedFile:
    buf = io.BytesIO()
    save_kwargs = {"exif": exif} if exif is not None else {}
    PILImage.new("RGB", size, color).save(buf, format=fmt, **save_kwargs)
    content_type = {
        "JPEG": "image/jpeg",
        "PNG": "image/png",
        "WEBP": "image/webp",
    }[fmt]
    return SimpleUploadedFile(
        filename or f"trip-photo.{fmt.lower()}",
        buf.getvalue(),
        content_type=content_type,
    )


class TripPhotoConfigurationTests(SimpleTestCase):
    def test_medium_variant_uses_large_album_preview_edge(self):
        self.assertEqual(settings.TRIP_PHOTO_MEDIUM_MAX_EDGE, 2560)

    def test_photo_memory_safety_defaults_are_configured(self):
        self.assertEqual(settings.TRIP_PHOTO_MAX_UPLOAD_BYTES, 50 * 1024 * 1024)
        self.assertEqual(settings.TRIP_PHOTO_MAX_UPLOAD_SOURCE_PIXELS, 90_000_000)
        self.assertEqual(settings.TRIP_PHOTO_MAX_DECODED_BYTES, 160 * 1024 * 1024)


class TripPhotoServiceTests(TestCase):
    def setUp(self) -> None:
        self.tempdir = TemporaryDirectory()
        self.override = override_settings(
            MEDIA_ROOT=self.tempdir.name,
            TRIP_PHOTO_MAX_BYTES=10 * 1024 * 1024,
            TRIP_PHOTO_MAX_SOURCE_PIXELS=45_000_000,
            TRIP_PHOTO_THUMBNAIL_MAX_EDGE=480,
            TRIP_PHOTO_MEDIUM_MAX_EDGE=2560,
            TRIP_PHOTO_WEBP_QUALITY=84,
            TRIP_PHOTO_MAX_FILES_PER_UPLOAD=20,
            TRIP_PHOTO_MAX_UPLOAD_SOURCE_PIXELS=90_000_000,
            TRIP_PHOTO_MAX_DECODED_BYTES=160 * 1024 * 1024,
        )
        self.override.enable()
        self.captain = create_completed_user("photo-cap@example.com", "photocap", "PHC001")
        self.member = create_completed_user("photo-member@example.com", "photomem", "PHM001")
        self.trip = _make_trip(self.captain)
        _add_member(self.trip, self.member)

    def tearDown(self) -> None:
        self.override.disable()
        self.tempdir.cleanup()

    def _media_files(self) -> list[Path]:
        return [
            path
            for path in Path(self.tempdir.name).rglob("*")
            if path.is_file()
        ]

    def test_create_trip_photos_generates_webp_thumbnail_and_medium(self):
        photos = create_trip_photos(
            trip_id=self.trip.id,
            actor=self.member,
            files=[_make_image_upload(size=(3840, 2160))],
        )

        self.assertEqual(len(photos), 1)
        photo = photos[0]
        self.assertEqual(photo.trip_id, self.trip.id)
        self.assertEqual(photo.uploaded_by_id, self.member.id)
        self.assertTrue(photo.thumbnail.name.startswith(f"trip-photos/{self.trip.id}/"))
        self.assertTrue(photo.medium.name.startswith(f"trip-photos/{self.trip.id}/"))
        self.assertTrue(photo.thumbnail.name.endswith(".webp"))
        self.assertTrue(photo.medium.name.endswith(".webp"))
        self.assertNotIn("trip-photo", Path(photo.thumbnail.name).name)
        self.assertNotIn("trip-photo", Path(photo.medium.name).name)

        with PILImage.open(photo.thumbnail.path) as thumbnail:
            self.assertEqual(thumbnail.format, "WEBP")
            self.assertLessEqual(max(thumbnail.size), 480)
            self.assertEqual(photo.thumbnail_width, thumbnail.width)
            self.assertEqual(photo.thumbnail_height, thumbnail.height)

        with PILImage.open(photo.medium.path) as medium:
            self.assertEqual(medium.format, "WEBP")
            self.assertLessEqual(max(medium.size), 2560)
            self.assertEqual(medium.size, (2560, 1440))
            self.assertEqual(photo.medium_width, medium.width)
            self.assertEqual(photo.medium_height, medium.height)

    def test_generated_photo_variants_strip_exif_metadata(self):
        exif = PILImage.Exif()
        exif[0x010E] = "sensitive trip description"

        photos = create_trip_photos(
            trip_id=self.trip.id,
            actor=self.member,
            files=[_make_image_upload(fmt="JPEG", exif=exif)],
        )

        with PILImage.open(photos[0].thumbnail.path) as thumbnail:
            self.assertEqual(dict(thumbnail.getexif()), {})
        with PILImage.open(photos[0].medium.path) as medium:
            self.assertEqual(dict(medium.getexif()), {})

    def test_create_trip_photos_rejects_svg(self):
        upload = SimpleUploadedFile(
            "photo.svg",
            b"<svg><script>alert(1)</script></svg>",
            content_type="image/svg+xml",
        )

        with self.assertRaises(TripPhotoValidationError) as ctx:
            create_trip_photos(trip_id=self.trip.id, actor=self.member, files=[upload])

        self.assertEqual(ctx.exception.error_code, "UNSUPPORTED_IMAGE_TYPE")
        self.assertEqual(TripPhoto.objects.count(), 0)

    def test_create_trip_photos_rejects_heic_with_clear_error(self):
        upload = SimpleUploadedFile(
            "photo.heic",
            b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00heicmif1",
            content_type="image/heic",
        )

        with self.assertRaises(TripPhotoValidationError) as ctx:
            create_trip_photos(trip_id=self.trip.id, actor=self.member, files=[upload])

        self.assertEqual(ctx.exception.error_code, "HEIC_UNSUPPORTED")
        self.assertIn("HEIC", ctx.exception.detail)

    def test_create_trip_photos_rejects_corrupt_image(self):
        upload = SimpleUploadedFile(
            "broken.jpg",
            b"\xff\xd8\xffnot a real jpeg",
            content_type="image/jpeg",
        )

        with self.assertRaises(TripPhotoValidationError) as ctx:
            create_trip_photos(trip_id=self.trip.id, actor=self.member, files=[upload])

        self.assertEqual(ctx.exception.error_code, "PHOTO_INVALID_IMAGE")
        self.assertEqual(TripPhoto.objects.count(), 0)

    def test_create_trip_photos_rejects_oversized_file(self):
        upload = SimpleUploadedFile(
            "large.jpg",
            b"\xff\xd8\xff" + b"A" * (10 * 1024 * 1024 + 1),
            content_type="image/jpeg",
        )

        with self.assertRaises(TripPhotoValidationError) as ctx:
            create_trip_photos(trip_id=self.trip.id, actor=self.member, files=[upload])

        self.assertEqual(ctx.exception.error_code, "PHOTO_TOO_LARGE")

    @override_settings(TRIP_PHOTO_MAX_UPLOAD_BYTES=100)
    def test_create_trip_photos_rejects_total_upload_bytes_above_cap(self):
        with self.assertRaises(TripPhotoValidationError) as ctx:
            create_trip_photos(
                trip_id=self.trip.id,
                actor=self.member,
                files=[
                    SimpleUploadedFile(
                        "one.jpg",
                        b"\xff\xd8\xff" + b"A" * 60,
                        content_type="image/jpeg",
                    ),
                    SimpleUploadedFile(
                        "two.jpg",
                        b"\xff\xd8\xff" + b"B" * 60,
                        content_type="image/jpeg",
                    ),
                ],
            )

        self.assertEqual(ctx.exception.error_code, "PHOTO_UPLOAD_TOO_LARGE")
        self.assertEqual(TripPhoto.objects.count(), 0)

    @override_settings(TRIP_PHOTO_MAX_FILES_PER_UPLOAD=2)
    def test_create_trip_photos_rejects_too_many_files(self):
        with self.assertRaises(TripPhotoValidationError) as ctx:
            create_trip_photos(
                trip_id=self.trip.id,
                actor=self.member,
                files=[
                    _make_image_upload(filename="one.jpg"),
                    _make_image_upload(filename="two.jpg"),
                    _make_image_upload(filename="three.jpg"),
                ],
            )

        self.assertEqual(ctx.exception.error_code, "TOO_MANY_FILES")
        self.assertEqual(TripPhoto.objects.count(), 0)

    @override_settings(TRIP_PHOTO_MAX_SOURCE_PIXELS=100)
    def test_create_trip_photos_rejects_oversized_source_pixels(self):
        upload = _make_image_upload(size=(11, 10))

        with self.assertRaises(TripPhotoValidationError) as ctx:
            create_trip_photos(trip_id=self.trip.id, actor=self.member, files=[upload])

        self.assertEqual(ctx.exception.error_code, "PHOTO_DIMENSIONS_TOO_LARGE")

    @override_settings(TRIP_PHOTO_MAX_UPLOAD_SOURCE_PIXELS=150)
    def test_create_trip_photos_rejects_total_source_pixels_above_cap(self):
        with self.assertRaises(TripPhotoValidationError) as ctx:
            create_trip_photos(
                trip_id=self.trip.id,
                actor=self.member,
                files=[
                    _make_image_upload(size=(10, 10), filename="one.jpg"),
                    _make_image_upload(size=(10, 10), filename="two.jpg"),
                ],
            )

        self.assertEqual(ctx.exception.error_code, "PHOTO_DIMENSIONS_TOO_LARGE")
        self.assertEqual(TripPhoto.objects.count(), 0)

    @override_settings(TRIP_PHOTO_MAX_DECODED_BYTES=399)
    def test_create_trip_photos_rejects_source_above_decoded_byte_budget(self):
        buf = io.BytesIO()
        PILImage.new("RGBA", (10, 10), (0, 0, 0, 0)).save(buf, format="PNG")
        upload = SimpleUploadedFile(
            "alpha.png",
            buf.getvalue(),
            content_type="image/png",
        )

        with self.assertRaises(TripPhotoValidationError) as ctx:
            create_trip_photos(trip_id=self.trip.id, actor=self.member, files=[upload])

        self.assertEqual(ctx.exception.error_code, "PHOTO_DIMENSIONS_TOO_LARGE")
        self.assertEqual(TripPhoto.objects.count(), 0)

    def test_delete_trip_photo_removes_variant_files(self):
        photo = create_trip_photos(
            trip_id=self.trip.id,
            actor=self.member,
            files=[_make_image_upload()],
        )[0]
        thumbnail_path = photo.thumbnail.path
        medium_path = photo.medium.path

        delete_trip_photo(trip_id=self.trip.id, photo_id=photo.id, actor=self.member)

        self.assertFalse(TripPhoto.objects.filter(pk=photo.pk).exists())
        self.assertFalse(os.path.exists(thumbnail_path))
        self.assertFalse(os.path.exists(medium_path))

    def test_mixed_valid_invalid_batch_creates_no_records_and_leaves_no_files(self):
        valid = _make_image_upload(filename="valid.jpg")
        invalid = SimpleUploadedFile(
            "bad.svg",
            b"<svg></svg>",
            content_type="image/svg+xml",
        )

        with self.assertRaises(TripPhotoValidationError) as ctx:
            create_trip_photos(
                trip_id=self.trip.id,
                actor=self.member,
                files=[valid, invalid],
            )

        self.assertEqual(ctx.exception.error_code, "UNSUPPORTED_IMAGE_TYPE")
        self.assertEqual(TripPhoto.objects.count(), 0)
        self.assertEqual(self._media_files(), [])

    def test_generation_failure_cleans_up_files_created_earlier_in_batch(self):
        first = _make_image_upload(filename="first.jpg", color="red")
        second = _make_image_upload(filename="second.jpg", color="green")

        saved_names: list[str] = []

        def flaky_save(storage_name: str, content) -> str:
            if len(saved_names) == 2:
                raise TripPhotoStorageError(
                    "PHOTO_STORAGE_ERROR",
                    "Could not store trip photo safely. Please try again.",
                )
            path = Path(self.tempdir.name) / storage_name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content.read())
            content.seek(0)
            saved_names.append(storage_name)
            return storage_name

        with patch("memories.services._save_trip_photo_file", side_effect=flaky_save):
            with self.assertRaises(TripPhotoStorageError):
                create_trip_photos(
                    trip_id=self.trip.id,
                    actor=self.member,
                    files=[first, second],
                )

        self.assertEqual(TripPhoto.objects.count(), 0)
        self.assertEqual(self._media_files(), [])

    def test_service_does_not_mutate_pillow_global_max_image_pixels(self):
        source = inspect.getsource(trip_photo_services)

        self.assertNotRegex(source, r"Image\.MAX_IMAGE_PIXELS\s*=")
