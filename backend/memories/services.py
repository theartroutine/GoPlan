from __future__ import annotations

import io
import logging
import uuid
from dataclasses import dataclass
from pathlib import PurePath
from typing import Iterable

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from PIL import Image, ImageOps, UnidentifiedImageError

from memories.models import TripPhoto
from trips.models import MemberStatus, TripMember, TripRole, TripStatus
from trips.services import TripNotFoundError, TripTerminalError

logger = logging.getLogger(__name__)

ALLOWED_SOURCE_FORMATS = {"JPEG", "PNG", "WEBP"}
IMAGE_PARSE_ERRORS = (
    UnidentifiedImageError,
    OSError,
    ValueError,
    SyntaxError,
    Image.DecompressionBombError,
)
HEIC_BRANDS = {b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1"}


class TripPhotoServiceError(Exception):
    error_code = "TRIP_PHOTO_ERROR"

    def __init__(self, error_code: str | None = None, detail: str | None = None) -> None:
        self.error_code = error_code or self.error_code
        self.detail = detail or "Trip photo request failed."
        super().__init__(self.detail)


class TripPhotoValidationError(TripPhotoServiceError):
    error_code = "PHOTO_INVALID_IMAGE"


class TripPhotoStorageError(TripPhotoServiceError):
    error_code = "PHOTO_STORAGE_ERROR"


class TripPhotoNotFoundError(TripPhotoServiceError):
    error_code = "PHOTO_NOT_FOUND"


class TripPhotoDeleteForbiddenError(TripPhotoServiceError):
    error_code = "PHOTO_DELETE_FORBIDDEN"


@dataclass(frozen=True)
class PreparedTripPhoto:
    original_filename: str
    original_width: int
    original_height: int
    thumbnail_content: ContentFile
    thumbnail_width: int
    thumbnail_height: int
    medium_content: ContentFile
    medium_width: int
    medium_height: int


def _setting(name: str, default: int) -> int:
    return int(getattr(settings, name, default))


def _max_files_per_upload() -> int:
    return _setting("TRIP_PHOTO_MAX_FILES_PER_UPLOAD", 20)


def _max_bytes() -> int:
    return _setting("TRIP_PHOTO_MAX_BYTES", 10 * 1024 * 1024)


def _max_source_pixels() -> int:
    return _setting("TRIP_PHOTO_MAX_SOURCE_PIXELS", 45_000_000)


def _thumbnail_max_edge() -> int:
    return _setting("TRIP_PHOTO_THUMBNAIL_MAX_EDGE", 480)


def _medium_max_edge() -> int:
    return _setting("TRIP_PHOTO_MEDIUM_MAX_EDGE", 1600)


def _webp_quality() -> int:
    return _setting("TRIP_PHOTO_WEBP_QUALITY", 84)


def _get_active_membership(trip_id, actor, *, for_update: bool = False):
    queryset = TripMember.objects.select_related("trip").filter(
        trip_id=trip_id,
        user=actor,
        status=MemberStatus.ACTIVE,
    )
    if for_update:
        queryset = queryset.select_for_update()
    try:
        return queryset.get()
    except TripMember.DoesNotExist as exc:
        raise TripNotFoundError("Trip not found.") from exc


def _assert_trip_accepts_photo_mutation(status: str) -> None:
    if status == TripStatus.CANCELLED:
        raise TripTerminalError("Cancelled trips cannot change photos.")


def list_trip_photos(*, trip_id, actor):
    _get_active_membership(trip_id, actor)
    return (
        TripPhoto.objects
        .filter(trip_id=trip_id)
        .select_related("uploaded_by")
        .order_by("-created_at", "-id")
    )


def _is_heic_header(header: bytes) -> bool:
    if len(header) < 12 or header[4:8] != b"ftyp":
        return False
    brands = {header[8:12]}
    brands.update(header[index:index + 4] for index in range(16, min(len(header), 64), 4))
    return any(brand in HEIC_BRANDS for brand in brands)


def _detect_source_format(image_file) -> str:
    image_file.seek(0)
    header = image_file.read(512)
    image_file.seek(0)

    stripped = header.lstrip().lower()
    if stripped.startswith(b"<svg") or b"<svg" in stripped[:128]:
        raise TripPhotoValidationError(
            "UNSUPPORTED_IMAGE_TYPE",
            "SVG images are not supported. Use JPEG, PNG, or WebP.",
        )
    if _is_heic_header(header):
        raise TripPhotoValidationError(
            "HEIC_UNSUPPORTED",
            "HEIC images are not supported yet. Please convert to JPEG, PNG, or WebP.",
        )
    if header.startswith(b"\xff\xd8\xff"):
        return "JPEG"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return "WEBP"
    raise TripPhotoValidationError(
        "UNSUPPORTED_IMAGE_TYPE",
        "Unsupported image format. Use JPEG, PNG, or WebP.",
    )


def _validate_upload_count(files: list) -> None:
    if not files:
        raise TripPhotoValidationError("NO_FILES", "Select at least one photo to upload.")
    if len(files) > _max_files_per_upload():
        raise TripPhotoValidationError(
            "TOO_MANY_FILES",
            f"Upload at most {_max_files_per_upload()} photos at a time.",
        )


def _safe_original_filename(image_file) -> str:
    raw_name = getattr(image_file, "name", "") or ""
    return PurePath(raw_name).name[:160]


def _validate_image_file(image_file) -> str:
    size = getattr(image_file, "size", 0)
    if size > _max_bytes():
        raise TripPhotoValidationError(
            "PHOTO_TOO_LARGE",
            f"Photo exceeds {_max_bytes() // (1024 * 1024)} MiB limit.",
        )

    expected_format = _detect_source_format(image_file)
    try:
        image_file.seek(0)
        with Image.open(image_file) as probe:
            if probe.format != expected_format or probe.format not in ALLOWED_SOURCE_FORMATS:
                raise TripPhotoValidationError(
                    "UNSUPPORTED_IMAGE_TYPE",
                    "Unsupported image format. Use JPEG, PNG, or WebP.",
                )
            if getattr(probe, "is_animated", False):
                raise TripPhotoValidationError(
                    "PHOTO_INVALID_IMAGE",
                    "Animated images are not supported.",
                )
            if probe.width * probe.height > _max_source_pixels():
                raise TripPhotoValidationError(
                    "PHOTO_DIMENSIONS_TOO_LARGE",
                    "Photo dimensions are too large.",
                )
            probe.verify()
    except TripPhotoValidationError:
        raise
    except IMAGE_PARSE_ERRORS as exc:
        raise TripPhotoValidationError(
            "PHOTO_INVALID_IMAGE",
            "Photo could not be parsed safely.",
        ) from exc
    finally:
        image_file.seek(0)
    return expected_format


def _to_clean_rgb(image: Image.Image) -> Image.Image:
    if image.mode in ("RGBA", "LA") or "transparency" in image.info:
        rgba = image.convert("RGBA")
        background = Image.new("RGB", rgba.size, "white")
        background.paste(rgba, mask=rgba.getchannel("A"))
        return background
    return image.convert("RGB")


def _resize_to_max_edge(image: Image.Image, max_edge: int) -> Image.Image:
    output = image.copy()
    if max(output.size) > max_edge:
        output.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    return output


def _encode_webp(image: Image.Image) -> ContentFile:
    output = io.BytesIO()
    image.save(output, format="WEBP", quality=_webp_quality(), method=6)
    return ContentFile(output.getvalue())


def _render_trip_photo_variants(image_file) -> PreparedTripPhoto:
    _validate_image_file(image_file)
    try:
        image_file.seek(0)
        with Image.open(image_file) as source:
            normalized = ImageOps.exif_transpose(source)
            normalized.load()
            clean = _to_clean_rgb(normalized)
            thumbnail = _resize_to_max_edge(clean, _thumbnail_max_edge())
            medium = _resize_to_max_edge(clean, _medium_max_edge())
            return PreparedTripPhoto(
                original_filename=_safe_original_filename(image_file),
                original_width=clean.width,
                original_height=clean.height,
                thumbnail_content=_encode_webp(thumbnail),
                thumbnail_width=thumbnail.width,
                thumbnail_height=thumbnail.height,
                medium_content=_encode_webp(medium),
                medium_width=medium.width,
                medium_height=medium.height,
            )
    except TripPhotoValidationError:
        raise
    except IMAGE_PARSE_ERRORS as exc:
        raise TripPhotoValidationError(
            "PHOTO_INVALID_IMAGE",
            "Photo could not be parsed safely.",
        ) from exc
    finally:
        image_file.seek(0)


def _variant_storage_name(trip_id, suffix: str) -> str:
    return f"trip-photos/{trip_id}/{uuid.uuid4().hex}_{suffix}.webp"


def _save_trip_photo_file(storage_name: str, content: ContentFile) -> str:
    content.seek(0)
    return default_storage.save(storage_name, content)


def _delete_storage_file_best_effort(name: str) -> None:
    try:
        default_storage.delete(name)
    except Exception:
        logger.warning("Failed to clean up trip photo storage file %s", name, exc_info=True)


def _delete_many_best_effort(names: Iterable[str]) -> None:
    for name in names:
        _delete_storage_file_best_effort(name)


def _build_photo_records(*, trip, actor, prepared_items: list[PreparedTripPhoto]) -> list[TripPhoto]:
    saved_names: list[str] = []
    created_photos: list[TripPhoto] = []
    try:
        for item in prepared_items:
            thumbnail_name = _save_trip_photo_file(
                _variant_storage_name(trip.id, "thumb"),
                item.thumbnail_content,
            )
            saved_names.append(thumbnail_name)
            medium_name = _save_trip_photo_file(
                _variant_storage_name(trip.id, "medium"),
                item.medium_content,
            )
            saved_names.append(medium_name)
            created_photos.append(
                TripPhoto(
                    trip=trip,
                    uploaded_by=actor,
                    uploaded_by_display_name_snapshot=actor.display_name,
                    uploaded_by_identify_tag_snapshot=actor.identify_tag,
                    original_filename=item.original_filename,
                    original_width=item.original_width,
                    original_height=item.original_height,
                    thumbnail=thumbnail_name,
                    medium=medium_name,
                    thumbnail_width=item.thumbnail_width,
                    thumbnail_height=item.thumbnail_height,
                    medium_width=item.medium_width,
                    medium_height=item.medium_height,
                )
            )

        with transaction.atomic():
            return list(TripPhoto.objects.bulk_create(created_photos))
    except TripPhotoServiceError:
        _delete_many_best_effort(saved_names)
        raise
    except Exception as exc:
        _delete_many_best_effort(saved_names)
        raise TripPhotoStorageError(
            "PHOTO_STORAGE_ERROR",
            "Could not store trip photo safely. Please try again.",
        ) from exc


def create_trip_photos(*, trip_id, actor, files: list) -> list[TripPhoto]:
    _validate_upload_count(files)
    membership = _get_active_membership(trip_id, actor)
    trip = membership.trip
    _assert_trip_accepts_photo_mutation(trip.status)

    prepared_items = [_render_trip_photo_variants(image_file) for image_file in files]
    return _build_photo_records(trip=trip, actor=actor, prepared_items=prepared_items)


def _get_photo_for_member(*, trip_id, photo_id, actor, for_update: bool = False):
    membership = _get_active_membership(trip_id, actor, for_update=for_update)
    queryset = TripPhoto.objects.filter(
        pk=photo_id,
        trip_id=trip_id,
    )
    if for_update:
        queryset = queryset.select_for_update()
    else:
        queryset = queryset.select_related("uploaded_by")
    try:
        return membership, queryset.get()
    except TripPhoto.DoesNotExist as exc:
        raise TripPhotoNotFoundError("PHOTO_NOT_FOUND", "Photo not found.") from exc


def delete_trip_photo(*, trip_id, photo_id, actor) -> None:
    with transaction.atomic():
        membership, photo = _get_photo_for_member(
            trip_id=trip_id,
            photo_id=photo_id,
            actor=actor,
            for_update=True,
        )
        _assert_trip_accepts_photo_mutation(membership.trip.status)

        can_delete = (
            photo.uploaded_by_id == actor.id
            or membership.role == TripRole.CAPTAIN
        )
        if not can_delete:
            raise TripPhotoDeleteForbiddenError(
                "PHOTO_DELETE_FORBIDDEN",
                "You do not have permission to delete this photo.",
            )

        thumbnail_name = photo.thumbnail.name
        medium_name = photo.medium.name
        photo.delete()

    _delete_storage_file_best_effort(thumbnail_name)
    _delete_storage_file_best_effort(medium_name)


def get_trip_photo_asset(*, trip_id, photo_id, actor, variant: str):
    _membership, photo = _get_photo_for_member(
        trip_id=trip_id,
        photo_id=photo_id,
        actor=actor,
    )
    if variant == "thumbnail":
        return photo.thumbnail
    if variant == "medium":
        return photo.medium
    raise TripPhotoNotFoundError("PHOTO_NOT_FOUND", "Photo not found.")
