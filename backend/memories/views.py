from __future__ import annotations

from django.http import FileResponse
from rest_framework import permissions, status
from rest_framework.pagination import CursorPagination
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from memories.serializers import TripPhotoSerializer, TripPhotoUploadSerializer
from memories.services import (
    TripPhotoDeleteForbiddenError,
    TripPhotoNotFoundError,
    TripPhotoServiceError,
    TripPhotoStorageError,
    TripPhotoValidationError,
    create_trip_photos,
    delete_trip_photo,
    get_trip_photo_asset,
    list_trip_photos,
    _get_active_membership,
)
from trips.permissions import IsProfileCompleted
from trips.services import TripNotFoundError, TripTerminalError

TRIP_PHOTO_PERMISSIONS = [permissions.IsAuthenticated, IsProfileCompleted]


class TripPhotoPagination(CursorPagination):
    page_size = 20
    ordering = ("-created_at", "-id")
    cursor_query_param = "cursor"


def _error_response(detail: str, error_code: str, status_code: int) -> Response:
    return Response(
        {"detail": detail, "error_code": error_code},
        status=status_code,
    )


def _map_service_error(exc: Exception) -> Response | None:
    if isinstance(exc, TripNotFoundError):
        return _error_response(str(exc), exc.error_code, status.HTTP_404_NOT_FOUND)
    if isinstance(exc, TripTerminalError):
        return _error_response(str(exc), exc.error_code, status.HTTP_409_CONFLICT)
    if isinstance(exc, TripPhotoDeleteForbiddenError):
        return _error_response(exc.detail, exc.error_code, status.HTTP_403_FORBIDDEN)
    if isinstance(exc, TripPhotoNotFoundError):
        return _error_response(exc.detail, exc.error_code, status.HTTP_404_NOT_FOUND)
    if isinstance(exc, TripPhotoValidationError):
        return _error_response(exc.detail, exc.error_code, status.HTTP_400_BAD_REQUEST)
    if isinstance(exc, TripPhotoStorageError):
        return _error_response(exc.detail, exc.error_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
    if isinstance(exc, TripPhotoServiceError):
        return _error_response(exc.detail, exc.error_code, status.HTTP_400_BAD_REQUEST)
    return None


class TripPhotoListCreateAPIView(APIView):
    permission_classes = TRIP_PHOTO_PERMISSIONS
    parser_classes = [MultiPartParser, FormParser]
    throttle_scope = "trip_photos_list"

    def get_throttles(self):
        self.throttle_scope = (
            "trip_photos_upload" if self.request.method == "POST" else "trip_photos_list"
        )
        return super().get_throttles()

    def get(self, request, trip_id):
        try:
            membership = _get_active_membership(trip_id, request.user)
            queryset = list_trip_photos(trip_id=trip_id, actor=request.user)
        except Exception as exc:
            response = _map_service_error(exc)
            if response is None:
                raise
            return response

        paginator = TripPhotoPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = TripPhotoSerializer(
            page,
            many=True,
            context={"actor": request.user, "membership": membership},
        )
        return paginator.get_paginated_response(serializer.data)

    def post(self, request, trip_id):
        serializer = TripPhotoUploadSerializer(
            data={"files": request.FILES.getlist("files")},
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        try:
            membership = _get_active_membership(trip_id, request.user)
            photos = create_trip_photos(
                trip_id=trip_id,
                actor=request.user,
                files=serializer.validated_data["files"],
            )
        except Exception as exc:
            response = _map_service_error(exc)
            if response is None:
                raise
            return response

        return Response(
            {
                "photos": TripPhotoSerializer(
                    photos,
                    many=True,
                    context={"actor": request.user, "membership": membership},
                ).data
            },
            status=status.HTTP_201_CREATED,
        )


class TripPhotoDetailAPIView(APIView):
    permission_classes = TRIP_PHOTO_PERMISSIONS
    throttle_scope = "trip_photos_detail"

    def delete(self, request, trip_id, photo_id):
        try:
            delete_trip_photo(trip_id=trip_id, photo_id=photo_id, actor=request.user)
        except Exception as exc:
            response = _map_service_error(exc)
            if response is None:
                raise
            return response
        return Response(status=status.HTTP_204_NO_CONTENT)


class TripPhotoAssetAPIView(APIView):
    permission_classes = TRIP_PHOTO_PERMISSIONS
    throttle_scope = "trip_photo_assets"

    def get(self, request, trip_id, photo_id, variant: str):
        try:
            field = get_trip_photo_asset(
                trip_id=trip_id,
                photo_id=photo_id,
                actor=request.user,
                variant=variant,
            )
        except Exception as exc:
            response = _map_service_error(exc)
            if response is None:
                raise
            return response

        response = FileResponse(field.storage.open(field.name, "rb"), content_type="image/webp")
        response.headers["Cache-Control"] = "private, max-age=3600"
        return response
