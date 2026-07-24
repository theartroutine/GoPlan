import logging
import os
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from configs.settings import env_int, env_positive_int


class SettingsEnvironmentTests(SimpleTestCase):
    def test_env_int_uses_default_when_variable_is_missing(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(env_int("DB_CONN_MAX_AGE", 0), 0)

    def test_env_int_parses_integer_value(self):
        with patch.dict(os.environ, {"DB_CONN_MAX_AGE": "60"}):
            self.assertEqual(env_int("DB_CONN_MAX_AGE", 0), 60)

    def test_env_int_rejects_non_integer_value(self):
        with patch.dict(os.environ, {"DB_CONN_MAX_AGE": "not-an-int"}):
            with self.assertRaises(ImproperlyConfigured):
                env_int("DB_CONN_MAX_AGE", 0)

    def test_env_positive_int_uses_default_when_variable_is_missing(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(
                env_positive_int("HERE_LOCATION_SEARCH_TIMEOUT_SECONDS", 5),
                5,
            )

    def test_env_positive_int_uses_default_when_variable_is_blank(self):
        with patch.dict(
            os.environ,
            {"HERE_LOCATION_SEARCH_TIMEOUT_SECONDS": "  "},
            clear=True,
        ):
            self.assertEqual(
                env_positive_int("HERE_LOCATION_SEARCH_TIMEOUT_SECONDS", 5),
                5,
            )

    def test_env_positive_int_parses_positive_integer_value(self):
        with patch.dict(
            os.environ,
            {"HERE_LOCATION_SEARCH_TIMEOUT_SECONDS": " 12 "},
            clear=True,
        ):
            self.assertEqual(
                env_positive_int("HERE_LOCATION_SEARCH_TIMEOUT_SECONDS", 5),
                12,
            )

    def test_env_positive_int_rejects_non_integer_value(self):
        with patch.dict(
            os.environ,
            {"HERE_LOCATION_SEARCH_TIMEOUT_SECONDS": "not-an-int"},
            clear=True,
        ):
            with self.assertRaisesMessage(
                ImproperlyConfigured,
                "HERE_LOCATION_SEARCH_TIMEOUT_SECONDS must be a positive integer.",
            ):
                env_positive_int("HERE_LOCATION_SEARCH_TIMEOUT_SECONDS", 5)

    def test_env_positive_int_rejects_zero(self):
        with patch.dict(
            os.environ,
            {"HERE_LOCATION_SEARCH_TIMEOUT_SECONDS": "0"},
            clear=True,
        ):
            with self.assertRaisesMessage(
                ImproperlyConfigured,
                "HERE_LOCATION_SEARCH_TIMEOUT_SECONDS must be a positive integer.",
            ):
                env_positive_int("HERE_LOCATION_SEARCH_TIMEOUT_SECONDS", 5)

    def test_env_positive_int_rejects_negative_integer(self):
        with patch.dict(
            os.environ,
            {"HERE_LOCATION_SEARCH_TIMEOUT_SECONDS": "-1"},
            clear=True,
        ):
            with self.assertRaisesMessage(
                ImproperlyConfigured,
                "HERE_LOCATION_SEARCH_TIMEOUT_SECONDS must be a positive integer.",
            ):
                env_positive_int("HERE_LOCATION_SEARCH_TIMEOUT_SECONDS", 5)

    def test_env_positive_int_rejects_non_positive_default(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesMessage(
                ImproperlyConfigured,
                "HERE_LOCATION_SEARCH_TIMEOUT_SECONDS must be a positive integer.",
            ):
                env_positive_int("HERE_LOCATION_SEARCH_TIMEOUT_SECONDS", 0)

    def test_http_client_request_url_logging_is_disabled_below_warning(self):
        for logger_name in ("httpx", "httpcore"):
            with self.subTest(logger_name=logger_name):
                logger = logging.getLogger(logger_name)
                self.assertFalse(logger.isEnabledFor(logging.INFO))
                self.assertTrue(logger.isEnabledFor(logging.WARNING))
