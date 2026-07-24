from __future__ import annotations

import re
import warnings
from collections.abc import Iterator
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import httpx
from django.core.cache import cache
from django.core.cache.backends.base import CacheKeyWarning
from django.test import SimpleTestCase, override_settings

from location_search.country_codes import (
    ISO_ALPHA3_TO_ALPHA2,
    normalize_country_code,
)
from location_search.services import (
    HERE_AUTOSUGGEST_URL,
    HERE_LANGUAGE,
    HERE_LOOKUP_URL,
    HERE_POLITICAL_VIEW,
    HERE_SUGGEST_LIMIT,
    VIETNAM_BIAS_AT,
    LocationProviderUnavailableError,
    LocationSearchDisabledError,
    LocationSearchNotConfiguredError,
    ensure_location_search_available,
    lookup_location,
    suggest_locations,
)

TEST_HERE_API_KEY = "test-here-api-key"
_UNSET = object()


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "location-search-service-tests",
        }
    },
    ENABLE_HERE_LOCATION_SEARCH=True,
    HERE_API_KEY=TEST_HERE_API_KEY,
    HERE_LOCATION_SEARCH_TIMEOUT_SECONDS=7,
    HERE_LOCATION_SEARCH_SUGGEST_CACHE_TTL_SECONDS=61,
    HERE_LOCATION_SEARCH_LOOKUP_CACHE_TTL_SECONDS=301,
)
class LocationSearchServiceTests(SimpleTestCase):
    def setUp(self) -> None:
        cache.clear()

    def tearDown(self) -> None:
        cache.clear()

    @contextmanager
    def _mock_here_client(
        self,
        *,
        payload: object = _UNSET,
    ) -> Iterator[tuple[MagicMock, MagicMock, MagicMock]]:
        response = MagicMock(name="here_response")
        if payload is not _UNSET:
            response.json.return_value = payload

        client = MagicMock(name="here_client")
        client.get.return_value = response

        client_context = MagicMock(name="here_client_context")
        client_context.__enter__.return_value = client
        client_context.__exit__.return_value = False

        with patch(
            "location_search.services.httpx.Client",
            return_value=client_context,
        ) as client_class:
            yield client_class, client, response

    @override_settings(
        ENABLE_HERE_LOCATION_SEARCH=False,
        HERE_API_KEY=TEST_HERE_API_KEY,
    )
    def test_availability_rejects_disabled_feature_before_key_check(self) -> None:
        with patch("location_search.services.httpx.Client") as client_class:
            with self.assertRaises(LocationSearchDisabledError) as caught:
                ensure_location_search_available()

        self.assertEqual(str(caught.exception), "Location search is disabled.")
        self.assertEqual(
            caught.exception.error_code,
            "LOCATION_SEARCH_DISABLED",
        )
        client_class.assert_not_called()

    @override_settings(
        ENABLE_HERE_LOCATION_SEARCH=True,
        HERE_API_KEY="   ",
    )
    def test_availability_rejects_blank_api_key(self) -> None:
        with patch("location_search.services.httpx.Client") as client_class:
            with self.assertRaises(LocationSearchNotConfiguredError) as caught:
                ensure_location_search_available()

        self.assertEqual(
            str(caught.exception),
            "Location search is not configured.",
        )
        self.assertEqual(
            caught.exception.error_code,
            "LOCATION_SEARCH_NOT_CONFIGURED",
        )
        client_class.assert_not_called()

    def test_availability_accepts_enabled_feature_with_key(self) -> None:
        with patch("location_search.services.httpx.Client") as client_class:
            ensure_location_search_available()

        client_class.assert_not_called()

    def test_short_suggest_queries_return_empty_without_provider_work(self) -> None:
        for query in ("", "a"):
            with self.subTest(query=query):
                with patch(
                    "location_search.services.httpx.Client"
                ) as client_class:
                    result = suggest_locations(query=query)

                self.assertEqual(result, [])
                client_class.assert_not_called()

    def test_suggest_uses_exact_provider_request_and_timeout(self) -> None:
        payload = {
            "items": [
                {
                    "id": "here:locality:danang",
                    "title": "Đà Nẵng",
                    "resultType": "locality",
                    "address": {"label": "Đà Nẵng, Việt Nam"},
                }
            ]
        }

        with self._mock_here_client(payload=payload) as (
            client_class,
            client,
            response,
        ):
            result = suggest_locations(query="Đà Nẵng")

        client_class.assert_called_once_with(timeout=7)
        client.get.assert_called_once_with(
            HERE_AUTOSUGGEST_URL,
            params={
                "q": "Đà Nẵng",
                "apiKey": TEST_HERE_API_KEY,
                "lang": HERE_LANGUAGE,
                "politicalView": HERE_POLITICAL_VIEW,
                "at": VIETNAM_BIAS_AT,
                "limit": str(HERE_SUGGEST_LIMIT),
            },
        )
        response.raise_for_status.assert_called_once_with()
        response.json.assert_called_once_with()
        self.assertEqual(
            result,
            [
                {
                    "provider": "here",
                    "provider_id": "here:locality:danang",
                    "title": "Đà Nẵng",
                    "subtitle": "Việt Nam",
                }
            ],
        )

    def test_suggest_stably_ranks_results_and_normalizes_subtitles(self) -> None:
        payload = {
            "items": [
                {
                    "id": "place",
                    "title": "Museum",
                    "resultType": "place",
                    "address": {"label": "Different label"},
                },
                {
                    "id": "locality-one",
                    "title": "Đà Nẵng",
                    "resultType": "locality",
                    "address": {"label": "Đà Nẵng, Việt Nam"},
                },
                {
                    "id": "other",
                    "title": "Other",
                    "resultType": "intersection",
                    "address": {"label": "Other"},
                },
                {
                    "id": "country",
                    "title": "Việt Nam",
                    "resultType": "country",
                    "address": {"label": "Việt Nam"},
                },
                {
                    "id": "locality-two",
                    "title": "Hội An",
                    "resultType": "locality",
                    "address": {"label": "Hội An, Quảng Nam"},
                },
                {
                    "id": "house",
                    "title": "1 Bạch Đằng",
                    "resultType": "houseNumber",
                },
                {
                    "id": "street",
                    "title": "Bạch Đằng",
                    "resultType": "street",
                    "address": {"label": "Bạch Đằng, Hải Châu"},
                },
                {
                    "id": "admin",
                    "title": "Quảng Nam",
                    "resultType": "administrativeArea",
                    "address": {"label": "Quảng Nam, Việt Nam"},
                },
            ]
        }

        with self._mock_here_client(payload=payload):
            result = suggest_locations(query="central vietnam")

        self.assertEqual(
            [suggestion["provider_id"] for suggestion in result],
            [
                "locality-one",
                "locality-two",
                "admin",
                "country",
                "street",
                "house",
                "place",
                "other",
            ],
        )
        self.assertEqual(result[0]["subtitle"], "Việt Nam")
        self.assertEqual(result[1]["subtitle"], "Quảng Nam")
        self.assertEqual(result[3]["subtitle"], "")
        self.assertEqual(result[5]["subtitle"], "")
        self.assertEqual(result[6]["subtitle"], "Different label")

    def test_suggest_drops_missing_or_blank_id_and_title(self) -> None:
        payload = {
            "items": [
                {"title": "Missing id", "resultType": "locality"},
                {
                    "id": "   ",
                    "title": "Blank id",
                    "resultType": "locality",
                },
                {"id": "missing-title", "resultType": "locality"},
                {
                    "id": "blank-title",
                    "title": "\t",
                    "resultType": "locality",
                },
                {
                    "id": "valid",
                    "title": "Valid",
                    "resultType": "locality",
                    "address": {"label": "Valid, Việt Nam"},
                },
            ]
        }

        with self._mock_here_client(payload=payload):
            result = suggest_locations(query="valid")

        self.assertEqual(
            result,
            [
                {
                    "provider": "here",
                    "provider_id": "valid",
                    "title": "Valid",
                    "subtitle": "Việt Nam",
                }
            ],
        )

    def test_suggest_defensively_caps_normalized_results_at_eight(self) -> None:
        payload = {
            "items": [
                {
                    "id": f"place-{index}",
                    "title": f"Place {index}",
                    "resultType": "place",
                }
                for index in range(12)
            ]
        }

        with self._mock_here_client(payload=payload):
            result = suggest_locations(query="overfull")

        self.assertEqual(len(result), 8)
        self.assertEqual(
            [suggestion["provider_id"] for suggestion in result],
            [f"place-{index}" for index in range(8)],
        )

    def test_suggest_treats_missing_items_as_empty_and_caches_the_empty_list(
        self,
    ) -> None:
        with self._mock_here_client(payload={}) as (_, client, _):
            first_result = suggest_locations(query="no results")
            second_result = suggest_locations(query="no results")

        self.assertEqual(first_result, [])
        self.assertEqual(second_result, [])
        client.get.assert_called_once()

    def test_suggest_cache_key_uses_casefold_and_cache_hit_skips_provider(
        self,
    ) -> None:
        cached_suggestions = [
            {
                "provider": "here",
                "provider_id": "cached-id",
                "title": "Cached title",
                "subtitle": "Cached subtitle",
            }
        ]
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", CacheKeyWarning)
            cache.set(
                "here:suggest:đà nẵng",
                cached_suggestions,
                timeout=60,
            )

        with patch("location_search.services.httpx.Client") as client_class:
            result = suggest_locations(query="ĐÀ NẴNG")

        self.assertEqual(result, cached_suggestions)
        client_class.assert_not_called()

    def test_cache_operations_do_not_log_raw_location_queries(self) -> None:
        with warnings.catch_warnings(record=True) as caught_warnings:
            warnings.warn("unrelated cache warning", CacheKeyWarning)
            with self._mock_here_client(payload={"items": []}):
                suggest_locations(query="Đà Nẵng")

        self.assertTrue(
            any(
                str(caught.message) == "unrelated cache warning"
                for caught in caught_warnings
            )
        )
        self.assertFalse(
            any(
                "here:suggest:" in str(caught.message)
                for caught in caught_warnings
            )
        )

    @override_settings(
        HERE_LOCATION_SEARCH_SUGGEST_CACHE_TTL_SECONDS=17,
    )
    def test_suggest_uses_configured_cache_ttl_and_exact_key(self) -> None:
        payload = {
            "items": [
                {
                    "id": "here:place:one",
                    "title": "One",
                    "resultType": "place",
                }
            ]
        }
        expected = [
            {
                "provider": "here",
                "provider_id": "here:place:one",
                "title": "One",
                "subtitle": "",
            }
        ]

        with (
            patch(
                "location_search.services.cache.get",
                return_value=None,
            ),
            patch("location_search.services.cache.set") as cache_set,
            self._mock_here_client(payload=payload),
        ):
            result = suggest_locations(query="MiXeD")

        self.assertEqual(result, expected)
        cache_set.assert_called_once_with(
            "here:suggest:mixed",
            expected,
            timeout=17,
        )

    def test_suggest_maps_http_status_failures_without_retry(self) -> None:
        for status_code in (429, 500, 503):
            with self.subTest(status_code=status_code):
                cache.clear()
                request = httpx.Request("GET", HERE_AUTOSUGGEST_URL)
                upstream_response = httpx.Response(
                    status_code,
                    request=request,
                )
                upstream_error = httpx.HTTPStatusError(
                    "upstream failed",
                    request=request,
                    response=upstream_response,
                )

                with self._mock_here_client(payload={}) as (
                    _,
                    client,
                    response,
                ):
                    response.raise_for_status.side_effect = upstream_error
                    with self.assertRaises(
                        LocationProviderUnavailableError
                    ) as caught:
                        suggest_locations(query=f"status {status_code}")

                self.assertEqual(
                    str(caught.exception),
                    "Location service unavailable.",
                )
                self.assertEqual(
                    caught.exception.error_code,
                    "LOCATION_PROVIDER_UNAVAILABLE",
                )
                client.get.assert_called_once()

    def test_suggest_maps_timeout_and_network_failures_without_retry(self) -> None:
        request = httpx.Request("GET", HERE_AUTOSUGGEST_URL)
        failures = (
            httpx.ReadTimeout("timed out", request=request),
            httpx.ConnectError("network unavailable", request=request),
        )

        for index, failure in enumerate(failures):
            with self.subTest(failure=type(failure).__name__):
                cache.clear()
                with self._mock_here_client() as (_, client, _):
                    client.get.side_effect = failure
                    with self.assertRaises(LocationProviderUnavailableError):
                        suggest_locations(query=f"network failure {index}")

                client.get.assert_called_once()

    def test_suggest_maps_invalid_json_to_provider_unavailable(self) -> None:
        with self._mock_here_client() as (_, client, response):
            response.json.side_effect = ValueError("invalid json")
            with self.assertRaises(LocationProviderUnavailableError):
                suggest_locations(query="invalid json")

        client.get.assert_called_once()

    def test_suggest_rejects_invalid_provider_shapes(self) -> None:
        invalid_payloads = (
            None,
            [],
            "invalid",
            {"items": "invalid"},
            {
                "items": [
                    {
                        "id": "valid",
                        "title": "Valid",
                        "resultType": "place",
                    },
                    42,
                ]
            },
        )

        for index, payload in enumerate(invalid_payloads):
            with self.subTest(payload=payload):
                cache.clear()
                with self._mock_here_client(payload=payload) as (_, client, _):
                    with self.assertRaises(LocationProviderUnavailableError):
                        suggest_locations(query=f"invalid shape {index}")

                client.get.assert_called_once()

    def test_provider_exception_does_not_expose_key_or_request_url(self) -> None:
        request_url = (
            f"{HERE_AUTOSUGGEST_URL}?q=secret&apiKey={TEST_HERE_API_KEY}"
        )
        request = httpx.Request("GET", request_url)
        upstream_response = httpx.Response(500, request=request)
        upstream_error = httpx.HTTPStatusError(
            f"failed request {request_url}",
            request=request,
            response=upstream_response,
        )

        with self._mock_here_client(payload={}) as (_, _, response):
            response.raise_for_status.side_effect = upstream_error
            with self.assertRaises(
                LocationProviderUnavailableError
            ) as caught:
                suggest_locations(query="secret")

        public_error = str(caught.exception)
        self.assertEqual(public_error, "Location service unavailable.")
        self.assertNotIn(TEST_HERE_API_KEY, public_error)
        self.assertNotIn(HERE_AUTOSUGGEST_URL, public_error)

    def test_lookup_uses_exact_provider_request_timeout_and_canonical_id(
        self,
    ) -> None:
        payload = {
            "id": "here:canonical:danang",
            "title": "Fallback title",
            "address": {
                "label": "Đà Nẵng, Việt Nam",
                "countryCode": "vnm",
            },
            "position": {"lat": 16.0544, "lng": 108.2022},
        }

        with self._mock_here_client(payload=payload) as (
            client_class,
            client,
            response,
        ):
            result = lookup_location(provider_id="here:requested:id")

        client_class.assert_called_once_with(timeout=7)
        client.get.assert_called_once_with(
            HERE_LOOKUP_URL,
            params={
                "id": "here:requested:id",
                "apiKey": TEST_HERE_API_KEY,
                "lang": HERE_LANGUAGE,
                "politicalView": HERE_POLITICAL_VIEW,
            },
        )
        response.raise_for_status.assert_called_once_with()
        response.json.assert_called_once_with()
        self.assertEqual(
            result,
            {
                "destination": "Đà Nẵng, Việt Nam",
                "destination_provider": "here",
                "destination_provider_id": "here:canonical:danang",
                "destination_lat": 16.0544,
                "destination_lng": 108.2022,
                "destination_country_code": "VN",
            },
        )
        self.assertNotEqual(
            result["destination_provider_id"],
            "here:requested:id",
        )

    def test_lookup_destination_fallback_order(self) -> None:
        cases = (
            (
                {
                    "id": "canonical-label",
                    "title": "Title",
                    "address": {"label": "Address label"},
                },
                "Address label",
            ),
            (
                {
                    "id": "canonical-title",
                    "title": "Title",
                    "address": {},
                },
                "Title",
            ),
            (
                {
                    "id": "canonical-empty-label",
                    "title": "Title",
                    "address": {"label": ""},
                },
                "Title",
            ),
            (
                {
                    "id": "canonical-empty",
                    "address": {},
                },
                "",
            ),
        )

        for payload, expected_destination in cases:
            with self.subTest(expected_destination=expected_destination):
                cache.clear()
                with self._mock_here_client(payload=payload):
                    result = lookup_location(
                        provider_id=f"request:{payload['id']}"
                    )

                self.assertEqual(
                    result["destination"],
                    expected_destination,
                )

    def test_lookup_normalizes_invalid_coordinates_to_null(self) -> None:
        payload = {
            "id": "canonical-invalid-coordinates",
            "address": {"countryCode": "US"},
            "position": {"lat": True, "lng": float("inf")},
        }

        with self._mock_here_client(payload=payload):
            result = lookup_location(provider_id="invalid-coordinates")

        self.assertIsNone(result["destination_lat"])
        self.assertIsNone(result["destination_lng"])
        self.assertEqual(result["destination_country_code"], "US")

    def test_lookup_tolerates_invalid_optional_nested_shapes(self) -> None:
        payload = {
            "id": "canonical-minimal",
            "title": 123,
            "address": ["not", "an", "object"],
            "position": "not-an-object",
        }

        with self._mock_here_client(payload=payload):
            result = lookup_location(provider_id="minimal")

        self.assertEqual(
            result,
            {
                "destination": "",
                "destination_provider": "here",
                "destination_provider_id": "canonical-minimal",
                "destination_lat": None,
                "destination_lng": None,
                "destination_country_code": "",
            },
        )

    def test_lookup_requires_non_blank_returned_canonical_id(self) -> None:
        invalid_payloads = (
            {},
            {"id": None},
            {"id": ""},
            {"id": "   "},
        )

        for index, payload in enumerate(invalid_payloads):
            with self.subTest(payload=payload):
                cache.clear()
                requested_id = f"requested-fallback-{index}"
                with self._mock_here_client(payload=payload) as (_, client, _):
                    with self.assertRaises(
                        LocationProviderUnavailableError
                    ):
                        lookup_location(provider_id=requested_id)

                client.get.assert_called_once()

    def test_lookup_rejects_invalid_root_shapes(self) -> None:
        for index, payload in enumerate((None, [], "invalid")):
            with self.subTest(payload=payload):
                cache.clear()
                with self._mock_here_client(payload=payload):
                    with self.assertRaises(
                        LocationProviderUnavailableError
                    ):
                        lookup_location(provider_id=f"invalid-root-{index}")

    def test_lookup_cache_hit_uses_exact_opaque_id_and_skips_provider(
        self,
    ) -> None:
        cached_location = {
            "destination": "Cached location",
            "destination_provider": "here",
            "destination_provider_id": "canonical-cached",
            "destination_lat": 16,
            "destination_lng": 108,
            "destination_country_code": "VN",
        }
        cache.set(
            "here:lookup:Here:Opaque:MiXeD",
            cached_location,
            timeout=60,
        )

        with patch("location_search.services.httpx.Client") as client_class:
            result = lookup_location(provider_id="Here:Opaque:MiXeD")

        self.assertEqual(result, cached_location)
        client_class.assert_not_called()

    @override_settings(
        HERE_LOCATION_SEARCH_LOOKUP_CACHE_TTL_SECONDS=23,
    )
    def test_lookup_uses_configured_cache_ttl_and_exact_key(self) -> None:
        payload = {
            "id": "canonical",
            "title": "Canonical location",
        }
        expected = {
            "destination": "Canonical location",
            "destination_provider": "here",
            "destination_provider_id": "canonical",
            "destination_lat": None,
            "destination_lng": None,
            "destination_country_code": "",
        }

        with (
            patch(
                "location_search.services.cache.get",
                return_value=None,
            ),
            patch("location_search.services.cache.set") as cache_set,
            self._mock_here_client(payload=payload),
        ):
            result = lookup_location(provider_id="Here:Opaque")

        self.assertEqual(result, expected)
        cache_set.assert_called_once_with(
            "here:lookup:Here:Opaque",
            expected,
            timeout=23,
        )

    def test_lookup_maps_http_timeout_network_and_bad_json_failures(
        self,
    ) -> None:
        request = httpx.Request("GET", HERE_LOOKUP_URL)
        cases = (
            httpx.HTTPStatusError(
                "upstream 429",
                request=request,
                response=httpx.Response(429, request=request),
            ),
            httpx.HTTPStatusError(
                "upstream 500",
                request=request,
                response=httpx.Response(500, request=request),
            ),
            httpx.ReadTimeout("timed out", request=request),
            httpx.ConnectError("network unavailable", request=request),
            ValueError("invalid json"),
        )

        for index, failure in enumerate(cases):
            with self.subTest(failure=type(failure).__name__):
                cache.clear()
                with self._mock_here_client() as (_, client, response):
                    if isinstance(failure, httpx.HTTPStatusError):
                        response.raise_for_status.side_effect = failure
                    elif isinstance(failure, httpx.HTTPError):
                        client.get.side_effect = failure
                    else:
                        response.json.side_effect = failure

                    with self.assertRaises(
                        LocationProviderUnavailableError
                    ) as caught:
                        lookup_location(provider_id=f"failure-{index}")

                self.assertEqual(
                    str(caught.exception),
                    "Location service unavailable.",
                )
                client.get.assert_called_once()


class CountryCodeSnapshotTests(SimpleTestCase):
    def test_snapshot_contains_249_well_formed_unique_assigned_pairs(
        self,
    ) -> None:
        self.assertEqual(len(ISO_ALPHA3_TO_ALPHA2), 249)
        self.assertEqual(
            len(set(ISO_ALPHA3_TO_ALPHA2.values())),
            len(ISO_ALPHA3_TO_ALPHA2),
        )

        for alpha3, alpha2 in ISO_ALPHA3_TO_ALPHA2.items():
            with self.subTest(alpha3=alpha3, alpha2=alpha2):
                self.assertIsNotNone(re.fullmatch(r"[A-Z]{3}", alpha3))
                self.assertIsNotNone(re.fullmatch(r"[A-Z]{2}", alpha2))

    def test_snapshot_contains_representative_mappings(self) -> None:
        self.assertEqual(ISO_ALPHA3_TO_ALPHA2["VNM"], "VN")
        self.assertEqual(ISO_ALPHA3_TO_ALPHA2["USA"], "US")
        self.assertEqual(ISO_ALPHA3_TO_ALPHA2["GBR"], "GB")
        self.assertEqual(ISO_ALPHA3_TO_ALPHA2["JPN"], "JP")

    def test_normalizer_preserves_assigned_alpha2_and_maps_alpha3(self) -> None:
        cases = (
            ("vn", "VN"),
            (" US ", "US"),
            ("vnm", "VN"),
            (" gBr ", "GB"),
            ("JPN", "JP"),
        )

        for raw_value, expected in cases:
            with self.subTest(raw_value=raw_value):
                self.assertEqual(
                    normalize_country_code(raw_value),
                    expected,
                )

    def test_normalizer_rejects_unassigned_malformed_and_non_string_values(
        self,
    ) -> None:
        invalid_values = (
            "ZZ",
            "",
            "   ",
            "ZZZ",
            "VNMX",
            "V",
            None,
            123,
            object(),
            b"VNM",
        )

        for raw_value in invalid_values:
            with self.subTest(raw_value=raw_value):
                self.assertEqual(normalize_country_code(raw_value), "")
