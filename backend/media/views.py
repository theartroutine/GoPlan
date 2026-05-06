from __future__ import annotations

import os
import uuid

from django.conf import settings
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

MAX_SIZE_BYTES = settings.UPLOAD_MAX_BYTES
EXTENSION_MAP = {
    "image/jpeg": ".jpg",
    "image/png":  ".png",
    "image/webp": ".webp",
}


# -------- Magic Byte Detection --------

def _detect_content_type(file_bytes: bytes) -> str | None:
    """Detect image type from magic bytes. Returns MIME type or None."""
    if len(file_bytes) >= 3 and file_bytes[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if len(file_bytes) >= 8 and file_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if len(file_bytes) >= 12 and file_bytes[:4] == b"RIFF" and file_bytes[8:12] == b"WEBP":
        return "image/webp"
    return None


# -------- Views --------

class TripCoverUploadAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "media_upload"

    def post(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response(
                {"detail": "No file provided.", "error_code": "NO_FILE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Read first 12 bytes for magic detection, then seek back
        header = file.read(12)
        file.seek(0)
        detected_type = _detect_content_type(header)

        if detected_type is None:
            return Response(
                {"detail": "Unsupported file type. Use JPEG, PNG, or WebP.", "error_code": "INVALID_TYPE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if file.size > MAX_SIZE_BYTES:
            return Response(
                {"detail": "File too large. Maximum size is 5 MB.", "error_code": "FILE_TOO_LARGE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ext = EXTENSION_MAP[detected_type]
        filename = f"{uuid.uuid4()}{ext}"
        save_dir = os.path.join(settings.MEDIA_ROOT, "trip-covers")
        os.makedirs(save_dir, exist_ok=True)
        save_path = os.path.join(save_dir, filename)

        with open(save_path, "wb") as dest:
            for chunk in file.chunks():
                dest.write(chunk)

        url = f"{settings.MEDIA_URL}trip-covers/{filename}"
        return Response({"url": url}, status=status.HTTP_201_CREATED)
