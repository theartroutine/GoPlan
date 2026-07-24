from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from location_search.serializers import (
    LocationSearchLookupQuerySerializer,
    LocationSearchQuerySerializer,
    LocationSearchSuggestQuerySerializer,
)
from location_search.services import (
    LocationProviderUnavailableError,
    LocationSearchDisabledError,
    LocationSearchNotConfiguredError,
    LocationSearchServiceError,
    ensure_location_search_available,
    lookup_location,
    suggest_locations,
)
from trips.permissions import IsProfileCompleted

LOCATION_SEARCH_PERMISSIONS = [permissions.IsAuthenticated, IsProfileCompleted]


def _service_error_response(
    exc: LocationSearchServiceError,
    *,
    status_code: int,
) -> Response:
    return Response(
        {"detail": str(exc), "error_code": exc.error_code},
        status=status_code,
    )


def _query_validation_error_response(
    serializer: LocationSearchQuerySerializer,
) -> Response | None:
    if serializer.is_valid():
        return None

    detail, error_code = serializer.get_public_error()
    return Response(
        {"detail": detail, "error_code": error_code},
        status=status.HTTP_400_BAD_REQUEST,
    )


def _availability_error_response(
    exc: LocationSearchDisabledError | LocationSearchNotConfiguredError,
) -> Response:
    return _service_error_response(
        exc,
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    )


class LocationSearchSuggestAPIView(APIView):
    permission_classes = LOCATION_SEARCH_PERMISSIONS
    throttle_scope = "location_search"

    def get(self, request):
        try:
            ensure_location_search_available()
        except (LocationSearchDisabledError, LocationSearchNotConfiguredError) as exc:
            return _availability_error_response(exc)

        serializer = LocationSearchSuggestQuerySerializer(
            data=request.query_params,
            context={"request": request},
        )
        validation_error = _query_validation_error_response(serializer)
        if validation_error is not None:
            return validation_error

        try:
            suggestions = suggest_locations(query=serializer.validated_data["q"])
        except LocationProviderUnavailableError as exc:
            return _service_error_response(
                exc,
                status_code=status.HTTP_502_BAD_GATEWAY,
            )

        return Response({"suggestions": suggestions}, status=status.HTTP_200_OK)


class LocationSearchLookupAPIView(APIView):
    permission_classes = LOCATION_SEARCH_PERMISSIONS
    throttle_scope = "location_search"

    def get(self, request):
        try:
            ensure_location_search_available()
        except (LocationSearchDisabledError, LocationSearchNotConfiguredError) as exc:
            return _availability_error_response(exc)

        serializer = LocationSearchLookupQuerySerializer(
            data=request.query_params,
            context={"request": request},
        )
        validation_error = _query_validation_error_response(serializer)
        if validation_error is not None:
            return validation_error

        try:
            location = lookup_location(
                provider_id=serializer.validated_data["id"],
            )
        except LocationProviderUnavailableError as exc:
            return _service_error_response(
                exc,
                status_code=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(location, status=status.HTTP_200_OK)
