from __future__ import annotations

import os
import uuid

from django.conf import settings
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
EXTENSION_MAP = {
    "image/jpeg": ".jpg",
    "image/png":  ".png",
    "image/webp": ".webp",
}


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

        if file.content_type not in ALLOWED_CONTENT_TYPES:
            return Response(
                {"detail": "Unsupported file type. Use JPEG, PNG, or WebP.", "error_code": "INVALID_TYPE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if file.size > MAX_SIZE_BYTES:
            return Response(
                {"detail": "File too large. Maximum size is 5 MB.", "error_code": "FILE_TOO_LARGE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ext = EXTENSION_MAP[file.content_type]
        filename = f"{uuid.uuid4()}{ext}"
        save_dir = os.path.join(settings.MEDIA_ROOT, "trip-covers")
        os.makedirs(save_dir, exist_ok=True)
        save_path = os.path.join(save_dir, filename)

        with open(save_path, "wb") as dest:
            for chunk in file.chunks():
                dest.write(chunk)

        url = f"{settings.MEDIA_URL}trip-covers/{filename}"
        return Response({"url": url}, status=status.HTTP_201_CREATED)
