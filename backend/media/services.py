from __future__ import annotations

import io
import mimetypes
from dataclasses import dataclass
from pathlib import PurePosixPath

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image, ImageOps

from media.image_validation import (
    ALLOWED_WEB_IMAGE_FORMATS,
    IMAGE_PARSE_ERRORS,
    ImageValidationError,
    detect_image_format_from_header,
    validate_pillow_image,
)


PUBLIC_MEDIA_PREFIXES = ("avatars/", "trip-covers/")
PUBLIC_MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable"
PUBLIC_MEDIA_CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


class PublicMediaNotFoundError(Exception):
    """Raised when a requested public media file is missing or not public."""


@dataclass(frozen=True)
class PublicMediaFile:
    file_obj: object
    content_type: str


def normalize_public_media_path(raw_path: str) -> str:
    if "\x00" in raw_path or "\\" in raw_path:
        raise PublicMediaNotFoundError("Media file not found.")

    path = PurePosixPath(raw_path)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise PublicMediaNotFoundError("Media file not found.")

    storage_path = str(path)
    if not any(storage_path.startswith(prefix) for prefix in PUBLIC_MEDIA_PREFIXES):
        raise PublicMediaNotFoundError("Media file not found.")

    return storage_path


def open_public_media_file(raw_path: str) -> PublicMediaFile:
    storage_path = normalize_public_media_path(raw_path)
    if not default_storage.exists(storage_path):
        raise PublicMediaNotFoundError("Media file not found.")

    suffix = PurePosixPath(storage_path).suffix.lower()
    content_type = (
        PUBLIC_MEDIA_CONTENT_TYPES.get(suffix)
        or mimetypes.guess_type(storage_path)[0]
        or "application/octet-stream"
    )
    return PublicMediaFile(
        file_obj=default_storage.open(storage_path, "rb"),
        content_type=content_type,
    )


# -------- Trip Cover Processing --------

def _cover_max_bytes() -> int:
    return int(getattr(settings, "TRIP_COVER_MAX_BYTES", 10 * 1024 * 1024))


def _cover_max_source_pixels() -> int:
    return int(getattr(settings, "TRIP_COVER_MAX_SOURCE_PIXELS", 45_000_000))


def _cover_max_edge() -> int:
    return int(getattr(settings, "TRIP_COVER_MAX_EDGE", 2560))


def _cover_webp_quality() -> int:
    return int(getattr(settings, "TRIP_COVER_WEBP_QUALITY", 84))


def _flatten_to_rgb(image: Image.Image) -> Image.Image:
    if image.mode in ("RGBA", "LA") or "transparency" in image.info:
        rgba = image.convert("RGBA")
        background = Image.new("RGB", rgba.size, "white")
        background.paste(rgba, mask=rgba.getchannel("A"))
        return background
    return image.convert("RGB")


def process_trip_cover(image_file) -> ContentFile:
    """
    Validate an uploaded cover image and re-encode it as a bounded WebP.

    Camera-sized sources (up to TRIP_COVER_MAX_SOURCE_PIXELS) are accepted
    and downscaled to TRIP_COVER_MAX_EDGE, so phone photos work without
    client-side resizing. Re-encoding also strips EXIF/GPS metadata.

    Raises ImageValidationError when the upload is not a safe web image.
    """
    size = getattr(image_file, "size", 0)
    if size > _cover_max_bytes():
        raise ImageValidationError(
            "FILE_TOO_LARGE",
            f"File too large. Maximum size is {_cover_max_bytes() // (1024 * 1024)} MB.",
        )

    image_file.seek(0)
    header = image_file.read(64)
    image_file.seek(0)
    expected_format = detect_image_format_from_header(header)

    validate_pillow_image(
        image_file,
        expected_format=expected_format,
        allowed_formats=ALLOWED_WEB_IMAGE_FORMATS,
        max_source_pixels=_cover_max_source_pixels(),
        reject_animated=False,
    )

    try:
        with Image.open(image_file) as source:
            normalized = ImageOps.exif_transpose(source)
            normalized.load()
            clean = _flatten_to_rgb(normalized)
            max_edge = _cover_max_edge()
            if max(clean.size) > max_edge:
                clean.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            clean.save(output, format="WEBP", quality=_cover_webp_quality(), method=6)
            return ContentFile(output.getvalue())
    except IMAGE_PARSE_ERRORS as exc:
        raise ImageValidationError(
            "PHOTO_INVALID_IMAGE",
            "Photo could not be parsed safely.",
        ) from exc
    finally:
        image_file.seek(0)
