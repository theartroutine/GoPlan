from __future__ import annotations

import hashlib
import logging
import math
import re
from collections.abc import Mapping
from typing import TypedDict, cast

import httpx
from django.conf import settings
from django.core.cache import cache

from location_search.country_codes import normalize_country_code

logger = logging.getLogger(__name__)

HERE_AUTOSUGGEST_URL = "https://geocode.search.hereapi.com/v1/autosuggest"
HERE_LOOKUP_URL = "https://lookup.search.hereapi.com/v1/lookup"
VIETNAM_BIAS_AT = "16.047079,108.206230"
HERE_LANGUAGE = "vi-VN"
HERE_POLITICAL_VIEW = "VNM"
HERE_SUGGEST_LIMIT = 8

SUGGEST_KIND = "suggest"
LOOKUP_KIND = "lookup"

# Connect and pool phases are bounded well below the configured read budget so a
# single slow provider call cannot pin a worker for a multiple of the timeout.
MAX_CONNECT_TIMEOUT_SECONDS = 2.0
MAX_POOL_TIMEOUT_SECONDS = 1.0

# One client for the process so autocomplete traffic reuses pooled TLS
# connections instead of repeating a handshake on every keystroke. Constructing
# the client opens no socket, so it is safe to build at import time.
_HTTP_CLIENT = httpx.Client()

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
    ensure_location_search_available()

    if len(query) < 2:
        return []

    cache_key = _cache_key(SUGGEST_KIND, query.casefold())
    cached = _cache_get(cache_key)
    if cached is not None:
        return cast(list[LocationSuggestion], cached)

    payload = _fetch_here_payload(
        kind=SUGGEST_KIND,
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
        logger.warning("HERE %s returned an unusable payload shape.", SUGGEST_KIND)
        raise LocationProviderUnavailableError from None

    _cache_set(
        cache_key,
        suggestions,
        timeout=settings.HERE_LOCATION_SEARCH_SUGGEST_CACHE_TTL_SECONDS,
    )
    return suggestions


def lookup_location(*, provider_id: str) -> LocationLookupResult:
    ensure_location_search_available()

    cache_key = _cache_key(LOOKUP_KIND, provider_id)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cast(LocationLookupResult, cached)

    payload = _fetch_here_payload(
        kind=LOOKUP_KIND,
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
        logger.warning("HERE %s returned an unusable payload shape.", LOOKUP_KIND)
        raise LocationProviderUnavailableError from None

    _cache_set(
        cache_key,
        location,
        timeout=settings.HERE_LOCATION_SEARCH_LOOKUP_CACHE_TTL_SECONDS,
    )
    return location


def _request_timeout() -> httpx.Timeout:
    read_timeout = float(settings.HERE_LOCATION_SEARCH_TIMEOUT_SECONDS)
    return httpx.Timeout(
        read_timeout,
        connect=min(MAX_CONNECT_TIMEOUT_SECONDS, read_timeout),
        pool=min(MAX_POOL_TIMEOUT_SECONDS, read_timeout),
    )


def _fetch_here_payload(
    *,
    kind: str,
    url: str,
    params: Mapping[str, str],
) -> object:
    try:
        response = _HTTP_CLIENT.get(url, params=params, timeout=_request_timeout())
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as exc:
        _log_provider_failure(kind, exc, status_code=exc.response.status_code)
        raise LocationProviderUnavailableError from None
    except (httpx.HTTPError, ValueError) as exc:
        _log_provider_failure(kind, exc)
        raise LocationProviderUnavailableError from None


def _log_provider_failure(
    kind: str,
    exc: Exception,
    *,
    status_code: int | None = None,
) -> None:
    """Log enough to diagnose a provider outage and nothing more.

    Never log the exception message or the request URL: httpx embeds the full
    URL in both, and HERE authenticates through an ``apiKey`` query parameter.
    """
    if status_code is None:
        logger.warning("HERE %s request failed: %s", kind, type(exc).__name__)
        return
    logger.warning(
        "HERE %s request failed: %s (status %s)",
        kind,
        type(exc).__name__,
        status_code,
    )


def _cache_key(kind: str, raw: str) -> str:
    """Namespace a cache key without embedding raw user input.

    Hashing keeps the key a fixed-length, backend-safe ASCII string, so no
    query text or opaque provider id reaches cache keys, cache warnings, or
    cache-inspection tooling.
    """
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"here:{kind}:{digest}"


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

    address_label = address.get("label")
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
        "destination_lat": _numeric_coordinate(position.get("lat")),
        "destination_lng": _numeric_coordinate(position.get("lng")),
        "destination_country_code": normalize_country_code(address.get("countryCode")),
    }


def _result_type_rank(item: dict[str, object]) -> int:
    result_type = item.get("resultType")
    if not isinstance(result_type, str):
        return _OTHER_RESULT_TYPE_RANK
    return _RESULT_TYPE_RANKS.get(result_type, _OTHER_RESULT_TYPE_RANK)


def _build_subtitle(item: dict[str, object], *, title: str) -> str:
    label = _as_dict(item.get("address")).get("label")
    if not isinstance(label, str):
        return ""
    if label.startswith(title):
        return re.sub(r"^,\s*", "", label[len(title) :], count=1)
    return label


def _as_dict(value: object) -> dict[str, object]:
    if isinstance(value, dict):
        return value
    return {}


def _is_non_blank_string(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _numeric_coordinate(value: object) -> int | float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(value):
        return None
    return value
