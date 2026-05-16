from __future__ import annotations

import mimetypes
from dataclasses import dataclass
from pathlib import PurePosixPath

from django.core.files.storage import default_storage


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
