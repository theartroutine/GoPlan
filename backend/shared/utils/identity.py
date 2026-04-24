from __future__ import annotations

from typing import TypeVar

T = TypeVar("T")


def canonical_pair(item_a: T, item_b: T) -> tuple[T, T]:
    """Return two model-like objects sorted by primary key."""
    if item_a.pk < item_b.pk:
        return item_a, item_b
    return item_b, item_a
