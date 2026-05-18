from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


def _parse_clock_time(value):
    if isinstance(value, datetime):
        return value.time().replace(tzinfo=None, microsecond=0)
    if isinstance(value, time):
        return value.replace(tzinfo=None, microsecond=0)
    if isinstance(value, str):
        text = value.strip()
        if "T" in text:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
            return parsed.time().replace(tzinfo=None, microsecond=0)
    return value


class SystemType(str, Enum):
    TRANSPORTATION = "TRANSPORTATION"
    ACCOMMODATION = "ACCOMMODATION"
    FOOD = "FOOD"
    SIGHTSEEING = "SIGHTSEEING"
    SHOPPING = "SHOPPING"
    CHECKIN_OUT = "CHECKIN_OUT"
    FREE_TIME = "FREE_TIME"
    OTHER = "OTHER"


class TimeMode(str, Enum):
    ALL_DAY = "ALL_DAY"
    FLEXIBLE = "FLEXIBLE"
    AT_TIME = "AT_TIME"
    TIME_RANGE = "TIME_RANGE"


class AssigneeScope(str, Enum):
    NONE = "NONE"
    USER = "USER"
    EVERYONE = "EVERYONE"


class LocationMode(str, Enum):
    MANUAL = "MANUAL"
    STRUCTURED = "STRUCTURED"


class PlaceArgs(BaseModel):
    provider: str = Field(min_length=1, max_length=16)
    provider_id: str = Field(min_length=1, max_length=255)
    title: str = Field(min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=255)
    lat: Decimal | None = None
    lng: Decimal | None = None


class _ActivityBase(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    system_type: SystemType | None = None
    custom_type_id: UUID | None = None
    time_mode: TimeMode | None = None
    start_time: time | None = None
    end_time: time | None = None
    location_mode: LocationMode | None = None
    location_label: str | None = Field(default=None, max_length=200)
    location_note: str | None = Field(default=None, max_length=200)
    place: PlaceArgs | None = None
    note: str | None = None
    meeting_point: str | None = Field(default=None, max_length=200)
    contact_name: str | None = Field(default=None, max_length=120)
    contact_phone: str | None = Field(default=None, max_length=32)
    booking_reference: str | None = Field(default=None, max_length=120)
    external_link: str | None = Field(default=None, max_length=500)
    reminder_offsets_minutes: list[int] | None = None
    assignee_scope: AssigneeScope = AssigneeScope.EVERYONE
    assignee_user_id: UUID | None = None

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def parse_clock_time(cls, value):
        return _parse_clock_time(value)

    @model_validator(mode="after")
    def end_after_start(self):
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class CreateTimelineActivityArgs(_ActivityBase):
    section_id: UUID | None = None
    section_date: date | None = None


class UpdateTimelineActivityArgs(BaseModel):
    activity_id: UUID
    title: str | None = Field(default=None, min_length=1, max_length=200)
    system_type: SystemType | None = None
    custom_type_id: UUID | None = None
    time_mode: TimeMode | None = None
    start_time: time | None = None
    end_time: time | None = None
    assignee_scope: AssigneeScope | None = None
    assignee_user_id: UUID | None = None
    location_mode: LocationMode | None = None
    location_label: str | None = Field(default=None, max_length=200)
    location_note: str | None = Field(default=None, max_length=200)
    place: PlaceArgs | None = None
    note: str | None = None
    meeting_point: str | None = Field(default=None, max_length=200)
    contact_name: str | None = Field(default=None, max_length=120)
    contact_phone: str | None = Field(default=None, max_length=32)
    booking_reference: str | None = Field(default=None, max_length=120)
    external_link: str | None = Field(default=None, max_length=500)
    reminder_offsets_minutes: list[int] | None = None

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def parse_clock_time(cls, value):
        return _parse_clock_time(value)

    @model_validator(mode="after")
    def end_after_start(self):
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class DeleteTimelineActivityArgs(BaseModel):
    activity_id: UUID


class UpdateTimelineActivityStatusArgs(BaseModel):
    activity_id: UUID
    status: Literal["UPCOMING", "IN_PROGRESS", "DONE", "CANCELLED"]

    @field_validator("status", mode="before")
    @classmethod
    def normalize_legacy_status(cls, value):
        if value == "PLANNED":
            return "UPCOMING"
        return value


class CreateExpenseArgs(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    total_amount: Decimal | None = None
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    collector_id: UUID | None = None
    description: str | None = Field(default=None, max_length=500)


class UpdateExpenseArgs(BaseModel):
    expense_id: UUID
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    total_amount: Decimal | None = Field(default=None, gt=0)
    collector_id: UUID | None = None


class DeleteExpenseArgs(BaseModel):
    expense_id: UUID


class _Contribution(BaseModel):
    user_id: UUID
    amount: Decimal = Field(ge=0)


class SetExpenseContributionArgs(BaseModel):
    expense_id: UUID
    contributions: list[_Contribution] | None = Field(default=None, min_length=1)
    scope: Literal[
        "all_participants_paid",
        "all_participants",
        "everyone_paid",
    ] | None = None

    @model_validator(mode="after")
    def requires_contributions_or_scope(self):
        if not self.contributions and self.scope is None:
            raise ValueError("contributions or scope is required")
        return self


class FinalizeSettlementArgs(BaseModel):
    pass


class ReopenSettlementArgs(BaseModel):
    settlement_id: UUID


class MarkTransferSentArgs(BaseModel):
    transfer_id: UUID


class ConfirmTransferReceivedArgs(BaseModel):
    transfer_id: UUID


class UpdateActionDraftArgs(BaseModel):
    draft_id: UUID
    fields: dict[str, object] = Field(min_length=1)


class RespondToUserArgs(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
