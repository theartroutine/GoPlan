import os
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from configs.settings import env_int


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
