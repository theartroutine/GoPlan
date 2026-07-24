from __future__ import annotations

import math
import re
import warnings
from collections.abc import Mapping
from typing import TypedDict, cast

import httpx
from django.conf import settings
from django.core.cache import cache
from django.core.cache.backends.base import CacheKeyWarning

from location_search.country_codes import normalize_country_code

HERE_AUTOSUGGEST_URL = "https://geocode.search.hereapi.com/v1/autosuggest"
HERE_LOOKUP_URL = "https://lookup.search.hereapi.com/v1/lookup"
VIETNAM_BIAS_AT = "16.047079,108.206230"
HERE_LANGUAGE = "vi-VN"
HERE_POLITICAL_VIEW = "VNM"
HERE_SUGGEST_LIMIT = 8

# Django warns when raw keys are incompatible with Memcached. The approved HERE
# key contract intentionally contains user input, so register one narrow filter
# at import time instead of mutating the process-wide warning state per request.
warnings.filterwarnings(
    "ignore",
    message=(
        r"Cache key contains characters that will cause errors if used with "
        r"memcached: .*here:(?:suggest|lookup):"
    ),
    category=CacheKeyWarning,
)

_RESULT_TYPE_RANKS = {
    "locality": 0,
    "administrativeArea": 1,
    "country": 2,
    "street": 3,
    "houseNumber": 4,
    "place": 5,
}
_OTHER_RESULT_TYPE_RANK = 6


class LocationSuggestion(TypedDict):
    provider: str
    provider_id: str
    title: str
    subtitle: str


class LocationLookupResult(TypedDict):
    destination: str
    destination_provider: str
    destination_provider_id: str
    destination_lat: int | float | None
    destination_lng: int | float | None
    destination_country_code: str


class LocationSearchServiceError(Exception):
    detail = "Location search failed."
    error_code = "LOCATION_SEARCH_ERROR"

    def __init__(self) -> None:
        super().__init__(self.detail)


class LocationSearchDisabledError(LocationSearchServiceError):
    detail = "Location search is disabled."
    error_code = "LOCATION_SEARCH_DISABLED"


class LocationSearchNotConfiguredError(LocationSearchServiceError):
    detail = "Location search is not configured."
    error_code = "LOCATION_SEARCH_NOT_CONFIGURED"


class LocationProviderUnavailableError(LocationSearchServiceError):
    detail = "Location service unavailable."
    error_code = "LOCATION_PROVIDER_UNAVAILABLE"


class _InvalidProviderResponseError(Exception):
    pass


def ensure_location_search_available() -> None:
    if not settings.ENABLE_HERE_LOCATION_SEARCH:
        raise LocationSearchDisabledError

    api_key = settings.HERE_API_KEY
    if not isinstance(api_key, str) or not api_key.strip():
        raise LocationSearchNotConfiguredError


def suggest_locations(*, query: str) -> list[LocationSuggestion]:
    if len(query) < 2:
        return []

    cache_key = f"here:suggest:{query.casefold()}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cast(list[LocationSuggestion], cached)

    payload = _fetch_here_payload(
        url=HERE_AUTOSUGGEST_URL,
        params={
            "q": query,
            "apiKey": settings.HERE_API_KEY,
            "lang": HERE_LANGUAGE,
            "politicalView": HERE_POLITICAL_VIEW,
            "at": VIETNAM_BIAS_AT,
            "limit": str(HERE_SUGGEST_LIMIT),
        },
    )

    try:
        suggestions = _normalize_suggestions(payload)
    except _InvalidProviderResponseError:
        raise LocationProviderUnavailableError from None

    _cache_set(
        cache_key,
        suggestions,
        timeout=settings.HERE_LOCATION_SEARCH_SUGGEST_CACHE_TTL_SECONDS,
    )
    return suggestions


def lookup_location(*, provider_id: str) -> LocationLookupResult:
    cache_key = f"here:lookup:{provider_id}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cast(LocationLookupResult, cached)

    payload = _fetch_here_payload(
        url=HERE_LOOKUP_URL,
        params={
            "id": provider_id,
            "apiKey": settings.HERE_API_KEY,
            "lang": HERE_LANGUAGE,
            "politicalView": HERE_POLITICAL_VIEW,
        },
    )

    try:
        location = _normalize_lookup(payload)
    except _InvalidProviderResponseError:
        raise LocationProviderUnavailableError from None

    _cache_set(
        cache_key,
        location,
        timeout=settings.HERE_LOCATION_SEARCH_LOOKUP_CACHE_TTL_SECONDS,
    )
    return location


def _fetch_here_payload(*, url: str, params: Mapping[str, str]) -> object:
    try:
        with httpx.Client(
            timeout=settings.HERE_LOCATION_SEARCH_TIMEOUT_SECONDS,
        ) as client:
            response = client.get(url, params=params)
            response.raise_for_status()
            return response.json()
    except (httpx.HTTPError, RuntimeError, TypeError, ValueError):
        raise LocationProviderUnavailableError from None


def _cache_get(key: str) -> object:
    return cache.get(key)


def _cache_set(key: str, value: object, *, timeout: int) -> None:
    cache.set(key, value, timeout=timeout)


def _normalize_suggestions(payload: object) -> list[LocationSuggestion]:
    if not isinstance(payload, dict):
        raise _InvalidProviderResponseError

    raw_items = payload.get("items")
    if raw_items is None:
        return []
    if not isinstance(raw_items, list):
        raise _InvalidProviderResponseError
    if any(not isinstance(item, dict) for item in raw_items):
        raise _InvalidProviderResponseError

    ordered_items = sorted(raw_items, key=_result_type_rank)
    suggestions: list[LocationSuggestion] = []

    for item in ordered_items:
        provider_id = item.get("id")
        title = item.get("title")
        if not _is_non_blank_string(provider_id) or not _is_non_blank_string(title):
            continue

        suggestions.append(
            {
                "provider": "here",
                "provider_id": provider_id,
                "title": title,
                "subtitle": _build_subtitle(item, title=title),
            }
        )
        if len(suggestions) == HERE_SUGGEST_LIMIT:
            break

    return suggestions


def _normalize_lookup(payload: object) -> LocationLookupResult:
    if not isinstance(payload, dict):
        raise _InvalidProviderResponseError

    canonical_id = payload.get("id")
    if not _is_non_blank_string(canonical_id):
        raise _InvalidProviderResponseError

    address = _as_dict(payload.get("address"))
    position = _as_dict(payload.get("position"))

    address_label = address.get("label") if address is not None else None
    title = payload.get("title")
    if isinstance(address_label, str) and address_label:
        destination = address_label
    elif isinstance(title, str) and title:
        destination = title
    else:
        destination = ""

    return {
        "destination": destination,
        "destination_provider": "here",
        "destination_provider_id": canonical_id,
        "destination_lat": _numeric_coordinate(
            position.get("lat") if position is not None else None
        ),
        "destination_lng": _numeric_coordinate(
            position.get("lng") if position is not None else None
        ),
        "destination_country_code": normalize_country_code(
            address.get("countryCode") if address is not None else None
        ),
    }


def _result_type_rank(item: dict[str, object]) -> int:
    result_type = item.get("resultType")
    if not isinstance(result_type, str):
        return _OTHER_RESULT_TYPE_RANK
    return _RESULT_TYPE_RANKS.get(result_type, _OTHER_RESULT_TYPE_RANK)


def _build_subtitle(item: dict[str, object], *, title: str) -> str:
    address = _as_dict(item.get("address"))
    label = address.get("label") if address is not None else None
    if not isinstance(label, str):
        return ""
    if label.startswith(title):
        return re.sub(r"^,\s*", "", label[len(title) :], count=1)
    return label


def _as_dict(value: object) -> dict[str, object] | None:
    if isinstance(value, dict):
        return value
    return None


def _is_non_blank_string(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _numeric_coordinate(value: object) -> int | float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(value):
        return None
    return value
