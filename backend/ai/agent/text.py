from __future__ import annotations

import re

# The model sometimes emits literal "\uXXXX" sequences as plain text instead
# of the character itself (mimicking ASCII-escaped JSON it saw in context).
_SURROGATE_PAIR_RE = re.compile(
    r"\\u([dD][89abAB][0-9a-fA-F]{2})\\u([dD][c-fC-F][0-9a-fA-F]{2})"
)
_BMP_ESCAPE_RE = re.compile(r"\\u([0-9a-fA-F]{4})")


def _decode_surrogate_pair(match: re.Match[str]) -> str:
    high = int(match.group(1), 16)
    low = int(match.group(2), 16)
    return chr(0x10000 + ((high - 0xD800) << 10) + (low - 0xDC00))


def _decode_bmp_escape(match: re.Match[str]) -> str:
    code_point = int(match.group(1), 16)
    if 0xD800 <= code_point <= 0xDFFF:
        # Lone surrogate: not a valid character on its own, keep the raw text.
        return match.group(0)
    return chr(code_point)


def decode_unicode_escapes(text: str) -> str:
    """Decode literal \\uXXXX escape sequences left in model output."""
    if "\\u" not in text:
        return text
    text = _SURROGATE_PAIR_RE.sub(_decode_surrogate_pair, text)
    return _BMP_ESCAPE_RE.sub(_decode_bmp_escape, text)
