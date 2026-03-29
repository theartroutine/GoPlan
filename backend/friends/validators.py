from __future__ import annotations

import re

from rest_framework import serializers

IDENTIFY_NAME_PATTERN = re.compile(r"^[a-z]{3,24}$")
IDENTIFY_CODE_PATTERN = re.compile(r"^[A-Z0-9]{6}$")


def parse_identify_tag(value: str) -> tuple[str, str]:
    """Validate and normalize identify_tag into (name, code)."""
    stripped = value.strip()
    parts = stripped.split("#")
    if len(parts) != 2:
        raise ValueError(
            "Invalid format. Use name#CODE (e.g. johndoe#ABC123)."
        )

    name = parts[0].strip().lower()
    code = parts[1].strip().upper()

    if not IDENTIFY_NAME_PATTERN.fullmatch(name):
        raise ValueError("Name part must be 3-24 lowercase letters.")

    if not IDENTIFY_CODE_PATTERN.fullmatch(code):
        raise ValueError(
            "Code part must be exactly 6 uppercase alphanumeric characters."
        )

    return name, code


def validate_identify_tag_format(value: str) -> tuple[str, str]:
    """Validate identify_tag for API inputs and raise DRF errors on failure."""
    try:
        return parse_identify_tag(value)
    except ValueError as exc:
        raise serializers.ValidationError(str(exc)) from exc


def normalize_identify_tag(value: str) -> str:
    """Return the canonical identify_tag representation."""
    name, code = validate_identify_tag_format(value)
    return f"{name}#{code}"
