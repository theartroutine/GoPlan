from __future__ import annotations

import re
from datetime import date, timedelta

FINALIZE_SETTLEMENT_RE = re.compile(
    r"\b(finali[sz]e|create|make|generate|ch[ốo]t|tạo|quyết toán|settle)\b"
    r".{0,80}\b(settlement|quyết toán|expenses?|chi phí)\b"
    r"|\b(settlement|quyết toán)\b.{0,80}\b(finali[sz]e|ch[ốo]t|tạo)\b",
    re.IGNORECASE,
)

CREATE_ACTIVITY_RE = re.compile(
    r"\b(create|add|tạo|thêm)\b.{0,80}\b(activity|activities|hoạt động|lịch trình)\b"
    r"|\b(activity|activities|hoạt động)\b.{0,80}\b(create|add|tạo|thêm)\b",
    re.IGNORECASE,
)

ISO_DATE_RE = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")
TRIP_DAY_RE = re.compile(r"(?:\bday|ngày)\s*(\d{1,2})\b", re.IGNORECASE)


def prompt_requests_settlement_finalization(prompt: str) -> bool:
    return bool(FINALIZE_SETTLEMENT_RE.search(prompt))


def _parse_iso_date(prompt: str) -> date | None:
    match = ISO_DATE_RE.search(prompt)
    if not match:
        return None
    try:
        return date.fromisoformat(match.group(1))
    except ValueError:
        return None


def _parse_trip_day_date(prompt: str, *, trip_start_date: str | None) -> date | None:
    if not trip_start_date:
        return None
    match = TRIP_DAY_RE.search(prompt)
    if not match:
        return None
    day_number = int(match.group(1))
    if day_number < 1:
        return None
    try:
        start_date = date.fromisoformat(trip_start_date)
    except ValueError:
        return None
    return start_date + timedelta(days=day_number - 1)


def missing_section_date_for_activity_prompt(
    *,
    prompt: str,
    context: dict,
) -> str | None:
    if not CREATE_ACTIVITY_RE.search(prompt):
        return None

    trip = context.get("trip")
    if not isinstance(trip, dict):
        return None

    requested_date = _parse_iso_date(prompt) or _parse_trip_day_date(
        prompt,
        trip_start_date=trip.get("start_date"),
    )
    if requested_date is None:
        return None

    existing_dates = {
        section.get("section_date")
        for section in context.get("sections", [])
        if isinstance(section, dict)
    }
    requested_date_text = requested_date.isoformat()
    if requested_date_text in existing_dates:
        return None
    return requested_date_text
