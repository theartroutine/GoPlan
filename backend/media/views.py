from __future__ import annotations

import uuid

from django.conf import settings
from django.core.files.storage import default_storage
from django.http import FileResponse, Http404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from media.image_validation import ImageValidationError
from media.services import (
    PUBLIC_MEDIA_CACHE_CONTROL,
    PublicMediaNotFoundError,
    open_public_media_file,
    process_trip_cover,
)


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

        try:
            processed = process_trip_cover(file)
        except ImageValidationError as exc:
            return Response(
                {"detail": exc.detail, "error_code": exc.error_code},
                status=status.HTTP_400_BAD_REQUEST,
            )

        saved_path = default_storage.save(
            f"trip-covers/{uuid.uuid4()}.webp", processed,
        )
        url = f"{settings.MEDIA_URL}{saved_path}"
        return Response({"url": url}, status=status.HTTP_201_CREATED)


class PublicMediaFileAPIView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_scope = "public_media"

    def get(self, request, file_path: str):
        try:
            media_file = open_public_media_file(file_path)
        except PublicMediaNotFoundError as exc:
            raise Http404("Media file not found.") from exc

        response = FileResponse(
            media_file.file_obj,
            content_type=media_file.content_type,
        )
        response.headers["Cache-Control"] = PUBLIC_MEDIA_CACHE_CONTROL
        return response
