from __future__ import annotations

from django.test import SimpleTestCase

from ai.agent.text import decode_unicode_escapes

# Escape sequences are assembled from fragments so no tooling between the
# repo and an editor can collapse them into real characters.
BS = "\\"
WAVE_ESCAPE = BS + "ud83d" + BS + "udc4b"  # escaped form of U+1F44B waving hand
SMILE_ESCAPE = BS + "ud83d" + BS + "ude0a"  # escaped form of U+1F60A smiling face
A_GRAVE_ESCAPE = BS + "u00e0"  # escaped form of U+00E0 a-grave
LONE_SURROGATE_ESCAPE = BS + "ud83d"  # high surrogate with no pair


class DecodeUnicodeEscapesTests(SimpleTestCase):
    def test_decodes_surrogate_pair_escape_to_emoji(self):
        self.assertEqual(
            decode_unicode_escapes(f"Hello {WAVE_ESCAPE}"),
            "Hello \N{WAVING HAND SIGN}",
        )

    def test_decodes_bmp_escapes_and_surrogate_pairs_in_mixed_text(self):
        self.assertEqual(
            decode_unicode_escapes(f"Ch{A_GRAVE_ESCAPE}o {SMILE_ESCAPE}!"),
            "Chào \N{SMILING FACE WITH SMILING EYES}!",
        )

    def test_leaves_plain_text_and_real_emoji_untouched(self):
        text = "Chào bạn \N{SMILING FACE WITH SMILING EYES}"
        self.assertEqual(decode_unicode_escapes(text), text)

    def test_leaves_lone_surrogate_escape_untouched(self):
        text = f"bad {LONE_SURROGATE_ESCAPE} end"
        self.assertEqual(decode_unicode_escapes(text), text)

    def test_leaves_text_without_escapes_untouched(self):
        self.assertEqual(decode_unicode_escapes("no escapes here"), "no escapes here")
