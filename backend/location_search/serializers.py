from __future__ import annotations

from typing import NoReturn

from rest_framework import serializers

LOCATION_QUERY_TOO_LONG = "LOCATION_QUERY_TOO_LONG"
LOCATION_QUERY_INVALID = "LOCATION_QUERY_INVALID"
LOCATION_ID_REQUIRED = "LOCATION_ID_REQUIRED"
LOCATION_ID_TOO_LONG = "LOCATION_ID_TOO_LONG"
LOCATION_ID_INVALID = "LOCATION_ID_INVALID"

MAX_LOCATION_QUERY_LENGTH = 120
# Matches the web BFF limit so a provider id accepted on web is accepted on
# mobile.
MAX_LOCATION_ID_LENGTH = 256


class LocationSearchQuerySerializer(serializers.Serializer):
    """Base serializer for query strings with a public error contract."""

    invalid_error_code = LOCATION_QUERY_INVALID

    @staticmethod
    def _raise_public_error(*, detail: str, error_code: str) -> NoReturn:
        raise serializers.ValidationError(
            {
                "detail": serializers.ErrorDetail(
                    detail,
                    code=error_code,
                )
            }
        )

    def get_public_error(self) -> tuple[str, str]:
        detail_errors = self.errors.get("detail", [])
        if detail_errors:
            error = detail_errors[0]
            return str(error), getattr(error, "code", self.invalid_error_code)
        return "Invalid query parameters.", self.invalid_error_code


class LocationSearchSuggestQuerySerializer(LocationSearchQuerySerializer):
    q = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        trim_whitespace=True,
    )

    def validate(self, attrs: dict[str, str]) -> dict[str, str]:
        query = attrs.get("q", "")
        if len(query) > MAX_LOCATION_QUERY_LENGTH:
            self._raise_public_error(
                detail="Search query is too long.",
                error_code=LOCATION_QUERY_TOO_LONG,
            )
        return attrs


class LocationSearchLookupQuerySerializer(LocationSearchQuerySerializer):
    invalid_error_code = LOCATION_ID_INVALID

    id = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        trim_whitespace=True,
    )

    def validate(self, attrs: dict[str, str]) -> dict[str, str]:
        provider_id = attrs.get("id", "")
        if not provider_id:
            self._raise_public_error(
                detail="id is required.",
                error_code=LOCATION_ID_REQUIRED,
            )
        if len(provider_id) > MAX_LOCATION_ID_LENGTH:
            self._raise_public_error(
                detail="Location id is too long.",
                error_code=LOCATION_ID_TOO_LONG,
            )
        return attrs
