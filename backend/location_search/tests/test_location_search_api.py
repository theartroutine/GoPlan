from __future__ import annotations

from unittest.mock import patch

from django.core.cache import cache
from django.test import override_settings
from django.urls import Resolver404, resolve
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.throttling import DevBypassScopedRateThrottle
from location_search.serializers import (
    LocationSearchLookupQuerySerializer,
    LocationSearchSuggestQuerySerializer,
)
from location_search.services import (
    SUGGEST_KIND,
    LocationProviderUnavailableError,
    _cache_key,
)
from test_helpers import create_completed_user, create_verified_user


SUGGEST_URL = "/api/location-search/suggest"
LOOKUP_URL = "/api/location-search/lookup"

ENABLED_HERE_SETTINGS = {
    "ENABLE_HERE_LOCATION_SEARCH": True,
    "HERE_API_KEY": "test-here-api-key",
    "HERE_LOCATION_SEARCH_TIMEOUT_SECONDS": 5,
    "HERE_LOCATION_SEARCH_SUGGEST_CACHE_TTL_SECONDS": 60,
    "HERE_LOCATION_SEARCH_LOOKUP_CACHE_TTL_SECONDS": 300,
}

DISABLED_ERROR = {
    "detail": "Location search is disabled.",
    "error_code": "LOCATION_SEARCH_DISABLED",
}
NOT_CONFIGURED_ERROR = {
    "detail": "Location search is not configured.",
    "error_code": "LOCATION_SEARCH_NOT_CONFIGURED",
}
PROVIDER_UNAVAILABLE_ERROR = {
    "detail": "Location service unavailable.",
    "error_code": "LOCATION_PROVIDER_UNAVAILABLE",
}
QUERY_TOO_LONG_ERROR = {
    "detail": "Search query is too long.",
    "error_code": "LOCATION_QUERY_TOO_LONG",
}
QUERY_INVALID_ERROR = {
    "detail": "Invalid query parameters.",
    "error_code": "LOCATION_QUERY_INVALID",
}
ID_REQUIRED_ERROR = {
    "detail": "id is required.",
    "error_code": "LOCATION_ID_REQUIRED",
}
ID_TOO_LONG_ERROR = {
    "detail": "Location id is too long.",
    "error_code": "LOCATION_ID_TOO_LONG",
}
ID_INVALID_ERROR = {
    "detail": "Invalid query parameters.",
    "error_code": "LOCATION_ID_INVALID",
}


@override_settings(**ENABLED_HERE_SETTINGS)
class LocationSearchAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.user = create_completed_user(
            "location-owner@example.com",
            "locationowner",
            "LOC001",
        )
        self.client.force_authenticate(user=self.user)

    def tearDown(self) -> None:
        self.client.force_authenticate(user=None)
        cache.clear()

    def test_routes_use_exact_paths_without_trailing_slashes(self):
        self.assertEqual(resolve(SUGGEST_URL).view_name, "location_search:suggest")
        self.assertEqual(resolve(LOOKUP_URL).view_name, "location_search:lookup")

        with self.assertRaises(Resolver404):
            resolve(f"{SUGGEST_URL}/")
        with self.assertRaises(Resolver404):
            resolve(f"{LOOKUP_URL}/")

    @patch("location_search.views.ensure_location_search_available")
    def test_anonymous_requests_return_401_before_availability_gate(
        self,
        mock_ensure_available,
    ):
        self.client.force_authenticate(user=None)

        for url in (SUGGEST_URL, LOOKUP_URL):
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(
                    response.status_code,
                    status.HTTP_401_UNAUTHORIZED,
                )

        mock_ensure_available.assert_not_called()

    @patch("location_search.views.ensure_location_search_available")
    def test_incomplete_profile_returns_403_before_availability_gate(
        self,
        mock_ensure_available,
    ):
        incomplete_user = create_verified_user(
            email="incomplete-location@example.com",
        )
        self.client.force_authenticate(user=incomplete_user)

        for url in (SUGGEST_URL, LOOKUP_URL):
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(
                    response.status_code,
                    status.HTTP_403_FORBIDDEN,
                )

        mock_ensure_available.assert_not_called()

    @override_settings(
        ENABLE_HERE_LOCATION_SEARCH=False,
        HERE_API_KEY="",
    )
    @patch("location_search.views.lookup_location")
    @patch("location_search.views.suggest_locations")
    def test_disabled_gate_precedes_configuration_and_query_validation(
        self,
        mock_suggest_locations,
        mock_lookup_location,
    ):
        responses = (
            self.client.get(SUGGEST_URL, {"q": "x" * 121}),
            self.client.get(LOOKUP_URL),
        )

        for response in responses:
            with self.subTest(path=response.wsgi_request.path):
                self.assertEqual(
                    response.status_code,
                    status.HTTP_503_SERVICE_UNAVAILABLE,
                )
                self.assertEqual(response.data, DISABLED_ERROR)

        mock_suggest_locations.assert_not_called()
        mock_lookup_location.assert_not_called()

    @override_settings(
        ENABLE_HERE_LOCATION_SEARCH=True,
        HERE_API_KEY="   ",
    )
    @patch("location_search.views.lookup_location")
    @patch("location_search.views.suggest_locations")
    def test_missing_key_gate_precedes_query_validation(
        self,
        mock_suggest_locations,
        mock_lookup_location,
    ):
        responses = (
            self.client.get(SUGGEST_URL, {"q": "x" * 121}),
            self.client.get(LOOKUP_URL),
        )

        for response in responses:
            with self.subTest(path=response.wsgi_request.path):
                self.assertEqual(
                    response.status_code,
                    status.HTTP_503_SERVICE_UNAVAILABLE,
                )
                self.assertEqual(response.data, NOT_CONFIGURED_ERROR)

        mock_suggest_locations.assert_not_called()
        mock_lookup_location.assert_not_called()

    @patch("location_search.views.suggest_locations", return_value=[])
    def test_suggest_trims_query_and_accepts_1_2_and_120_character_boundaries(
        self,
        mock_suggest_locations,
    ):
        cases = (
            (" a ", "a"),
            (" ab ", "ab"),
            (f" {'x' * 120} ", "x" * 120),
        )

        for supplied_query, expected_query in cases:
            with self.subTest(length=len(expected_query)):
                mock_suggest_locations.reset_mock()
                response = self.client.get(
                    SUGGEST_URL,
                    {"q": supplied_query},
                )

                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(response.data, {"suggestions": []})
                mock_suggest_locations.assert_called_once_with(
                    query=expected_query,
                )

    @patch("location_search.services._fetch_here_payload")
    def test_suggest_query_shorter_than_two_never_calls_provider(
        self,
        mock_fetch_here_payload,
    ):
        response = self.client.get(SUGGEST_URL, {"q": " a "})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"suggestions": []})
        mock_fetch_here_payload.assert_not_called()

    @patch("location_search.views.suggest_locations")
    def test_suggest_rejects_121_characters_without_service_call(
        self,
        mock_suggest_locations,
    ):
        response = self.client.get(SUGGEST_URL, {"q": "x" * 121})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data, QUERY_TOO_LONG_ERROR)
        mock_suggest_locations.assert_not_called()

    @patch("location_search.views.suggest_locations")
    def test_suggest_rejects_null_character_with_public_error_code(
        self,
        mock_suggest_locations,
    ):
        response = self.client.get(SUGGEST_URL, {"q": "da\x00nang"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data, QUERY_INVALID_ERROR)
        mock_suggest_locations.assert_not_called()

    @patch("location_search.views.suggest_locations")
    def test_suggest_success_wraps_service_payload(
        self,
        mock_suggest_locations,
    ):
        suggestions = [
            {
                "provider": "here",
                "provider_id": "here:cm:namedplace:123",
                "title": "Da Nang",
                "subtitle": "Vietnam",
            }
        ]
        mock_suggest_locations.return_value = suggestions

        response = self.client.get(SUGGEST_URL, {"q": "Da Nang"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"suggestions": suggestions})
        mock_suggest_locations.assert_called_once_with(query="Da Nang")

    @patch(
        "location_search.views.suggest_locations",
        side_effect=LocationProviderUnavailableError,
    )
    def test_suggest_provider_failure_is_generic_and_leaks_no_secret(
        self,
        mock_suggest_locations,
    ):
        response = self.client.get(SUGGEST_URL, {"q": "Da Nang"})

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(response.data, PROVIDER_UNAVAILABLE_ERROR)
        response_text = response.content.decode()
        self.assertNotIn(ENABLED_HERE_SETTINGS["HERE_API_KEY"], response_text)
        self.assertNotIn("hereapi.com", response_text)
        mock_suggest_locations.assert_called_once_with(query="Da Nang")

    @patch("location_search.views.lookup_location")
    def test_lookup_missing_and_blank_id_return_exact_required_error(
        self,
        mock_lookup_location,
    ):
        cases = ({}, {"id": "   "})

        for query_params in cases:
            with self.subTest(query_params=query_params):
                response = self.client.get(LOOKUP_URL, query_params)
                self.assertEqual(
                    response.status_code,
                    status.HTTP_400_BAD_REQUEST,
                )
                self.assertEqual(response.data, ID_REQUIRED_ERROR)

        mock_lookup_location.assert_not_called()

    @patch("location_search.views.lookup_location")
    def test_lookup_trims_and_accepts_256_character_id(
        self,
        mock_lookup_location,
    ):
        provider_id = "p" * 256
        lookup_result = {
            "destination": "Da Nang, Vietnam",
            "destination_provider": "here",
            "destination_provider_id": provider_id,
            "destination_lat": 16.047079,
            "destination_lng": 108.20623,
            "destination_country_code": "VN",
        }
        mock_lookup_location.return_value = lookup_result

        response = self.client.get(
            LOOKUP_URL,
            {"id": f" {provider_id} "},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, lookup_result)
        mock_lookup_location.assert_called_once_with(provider_id=provider_id)

    @patch("location_search.views.lookup_location")
    def test_lookup_rejects_257_character_id_without_service_call(
        self,
        mock_lookup_location,
    ):
        response = self.client.get(LOOKUP_URL, {"id": "p" * 257})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data, ID_TOO_LONG_ERROR)
        mock_lookup_location.assert_not_called()

    @patch("location_search.views.lookup_location")
    def test_lookup_rejects_null_character_with_public_error_code(
        self,
        mock_lookup_location,
    ):
        response = self.client.get(LOOKUP_URL, {"id": "here\x00id"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data, ID_INVALID_ERROR)
        mock_lookup_location.assert_not_called()

    def test_serializers_reject_surrogates_with_public_error_codes(self):
        cases = (
            (
                LocationSearchSuggestQuerySerializer,
                {"q": "\ud800"},
                QUERY_INVALID_ERROR,
            ),
            (
                LocationSearchLookupQuerySerializer,
                {"id": "\ud800"},
                ID_INVALID_ERROR,
            ),
        )

        for serializer_class, data, expected_error in cases:
            with self.subTest(serializer_class=serializer_class.__name__):
                serializer = serializer_class(data=data)
                self.assertFalse(serializer.is_valid())
                detail, error_code = serializer.get_public_error()
                self.assertEqual(
                    {"detail": detail, "error_code": error_code},
                    expected_error,
                )

    @patch("location_search.views.lookup_location")
    def test_lookup_success_returns_flat_service_payload_unchanged(
        self,
        mock_lookup_location,
    ):
        lookup_result = {
            "destination": "Hoi An, Quang Nam, Vietnam",
            "destination_provider": "here",
            "destination_provider_id": "here:cm:namedplace:456",
            "destination_lat": 15.880058,
            "destination_lng": 108.338047,
            "destination_country_code": "VN",
        }
        mock_lookup_location.return_value = lookup_result

        response = self.client.get(
            LOOKUP_URL,
            {"id": "here:cm:namedplace:456"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, lookup_result)
        mock_lookup_location.assert_called_once_with(
            provider_id="here:cm:namedplace:456",
        )

    @patch(
        "location_search.views.lookup_location",
        side_effect=LocationProviderUnavailableError,
    )
    def test_lookup_provider_failure_is_generic_and_leaks_no_secret(
        self,
        mock_lookup_location,
    ):
        response = self.client.get(
            LOOKUP_URL,
            {"id": "here:cm:namedplace:456"},
        )

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(response.data, PROVIDER_UNAVAILABLE_ERROR)
        response_text = response.content.decode()
        self.assertNotIn(ENABLED_HERE_SETTINGS["HERE_API_KEY"], response_text)
        self.assertNotIn("hereapi.com", response_text)
        mock_lookup_location.assert_called_once_with(
            provider_id="here:cm:namedplace:456",
        )


@override_settings(
    **ENABLED_HERE_SETTINGS,
    DEBUG=False,
    DEV_THROTTLE_BYPASS_ENABLED=False,
)
class LocationSearchThrottleTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.user = create_completed_user(
            "location-throttle@example.com",
            "locationthrottle",
            "LOC002",
        )
        self.client.force_authenticate(user=self.user)

    def tearDown(self) -> None:
        self.client.force_authenticate(user=None)
        cache.clear()

    @patch("location_search.views.lookup_location")
    @patch("location_search.views.suggest_locations", return_value=[])
    def test_exhausting_suggest_does_not_starve_lookup(
        self,
        mock_suggest_locations,
        mock_lookup_location,
    ):
        """Lookup commits the chosen place, so autocomplete must not spend its budget."""
        mock_lookup_location.return_value = {
            "destination": "Hoi An, Quang Nam, Vietnam",
            "destination_provider": "here",
            "destination_provider_id": "here:cm:namedplace:456",
            "destination_lat": 15.880058,
            "destination_lng": 108.338047,
            "destination_country_code": "VN",
        }
        rates = {
            **DevBypassScopedRateThrottle.THROTTLE_RATES,
            "location_suggest": "1/hour",
            "location_lookup": "1/hour",
        }

        with patch.object(
            DevBypassScopedRateThrottle,
            "THROTTLE_RATES",
            rates,
        ):
            first_suggest = self.client.get(SUGGEST_URL, {"q": "Da Nang"})
            second_suggest = self.client.get(SUGGEST_URL, {"q": "Da Nang 2"})
            first_lookup = self.client.get(
                LOOKUP_URL,
                {"id": "here:cm:namedplace:456"},
            )
            second_lookup = self.client.get(
                LOOKUP_URL,
                {"id": "here:cm:namedplace:789"},
            )

        self.assertEqual(first_suggest.status_code, status.HTTP_200_OK)
        self.assertEqual(
            second_suggest.status_code,
            status.HTTP_429_TOO_MANY_REQUESTS,
        )
        self.assertIn("Retry-After", second_suggest)

        # The exhausted suggest bucket must not have spent the lookup budget.
        self.assertEqual(first_lookup.status_code, status.HTTP_200_OK)
        self.assertEqual(
            second_lookup.status_code,
            status.HTTP_429_TOO_MANY_REQUESTS,
        )
        self.assertIn("Retry-After", second_lookup)

        mock_suggest_locations.assert_called_once_with(query="Da Nang")
        mock_lookup_location.assert_called_once_with(
            provider_id="here:cm:namedplace:456",
        )

    @patch("location_search.services._fetch_here_payload")
    def test_cache_hit_still_consumes_throttle_quota(
        self,
        mock_fetch_here_payload,
    ):
        cache.set(_cache_key(SUGGEST_KIND, "da nang"), [], timeout=60)
        rates = {
            **DevBypassScopedRateThrottle.THROTTLE_RATES,
            "location_suggest": "1/hour",
        }

        with patch.object(
            DevBypassScopedRateThrottle,
            "THROTTLE_RATES",
            rates,
        ):
            first_response = self.client.get(SUGGEST_URL, {"q": "Da Nang"})
            second_response = self.client.get(SUGGEST_URL, {"q": "Da Nang"})

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(first_response.data, {"suggestions": []})
        self.assertEqual(
            second_response.status_code,
            status.HTTP_429_TOO_MANY_REQUESTS,
        )
        self.assertIn("Retry-After", second_response)
        mock_fetch_here_payload.assert_not_called()
