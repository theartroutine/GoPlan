from django.test import SimpleTestCase
from rest_framework import serializers

from friends.validators import (
    normalize_identify_tag,
    parse_identify_tag,
    validate_identify_tag_format,
)


class IdentifyTagValidatorTests(SimpleTestCase):
    def test_parse_identify_tag_normalizes_name_and_code(self):
        self.assertEqual(
            parse_identify_tag("  Bob # def456  "),
            ("bob", "DEF456"),
        )

    def test_validate_identify_tag_format_rejects_invalid_name(self):
        with self.assertRaises(serializers.ValidationError):
            validate_identify_tag_format("ab#ABC123")

    def test_normalize_identify_tag_returns_canonical_value(self):
        self.assertEqual(
            normalize_identify_tag("  Bob # def456  "),
            "bob#DEF456",
        )
