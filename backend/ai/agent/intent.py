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
QUOTED_TITLE_RE = re.compile(r"['\"“”](.+?)['\"“”]")
TIME_RANGE_RE = re.compile(
    r"(?:\bfrom|từ)\s*(\d{1,2}:\d{2})(?::\d{2})?"
    r".{0,20}?(?:\bto|đến|-)\s*(\d{1,2}:\d{2})(?::\d{2})?",
    re.IGNORECASE,
)
AT_TIME_RE = re.compile(
    r"(?:\bat|lúc|vào)\s*(\d{1,2}:\d{2})(?::\d{2})?",
    re.IGNORECASE,
)


def prompt_requests_settlement_finalization(prompt: str) -> bool:
    return bool(FINALIZE_SETTLEMENT_RE.search(prompt))


def prompt_requests_timeline_activity_creation(prompt: str) -> bool:
    return bool(CREATE_ACTIVITY_RE.search(prompt))


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


def _requested_activity_date(*, prompt: str, context: dict) -> date | None:
    trip = context.get("trip")
    if not isinstance(trip, dict):
        return None
    return _parse_iso_date(prompt) or _parse_trip_day_date(
        prompt,
        trip_start_date=trip.get("start_date"),
    )


def _format_clock(text: str) -> str:
    hour_text, minute_text = text.split(":", 1)
    return f"{int(hour_text):02d}:{minute_text}:00"


def _activity_section_arguments(*, requested_date: date | None, context: dict) -> dict:
    if requested_date is None:
        return {}
    requested_date_text = requested_date.isoformat()
    for section in context.get("sections", []):
        if not isinstance(section, dict):
            continue
        if section.get("section_date") == requested_date_text:
            section_id = section.get("section_id")
            return {"section_id": section_id} if section_id else {}
    return {"section_date": requested_date_text}


def _activity_title_arguments(prompt: str) -> dict:
    match = QUOTED_TITLE_RE.search(prompt)
    if not match:
        return {}
    title = match.group(1).strip()
    return {"title": title} if title else {}


def _activity_time_arguments(prompt: str) -> dict:
    range_match = TIME_RANGE_RE.search(prompt)
    if range_match:
        return {
            "time_mode": "TIME_RANGE",
            "start_time": _format_clock(range_match.group(1)),
            "end_time": _format_clock(range_match.group(2)),
        }
    at_match = AT_TIME_RE.search(prompt)
    if at_match:
        return {
            "time_mode": "AT_TIME",
            "start_time": _format_clock(at_match.group(1)),
        }
    return {}


def timeline_activity_repair_arguments(*, prompt: str, context: dict) -> dict | None:
    if not prompt_requests_timeline_activity_creation(prompt):
        return None
    requested_date = _requested_activity_date(prompt=prompt, context=context)
    return {
        **_activity_section_arguments(
            requested_date=requested_date,
            context=context,
        ),
        **_activity_title_arguments(prompt),
        **_activity_time_arguments(prompt),
    }
