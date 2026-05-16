from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class SystemType(str, Enum):
    SIGHTSEEING = "SIGHTSEEING"
    DINING = "DINING"
    SHOPPING = "SHOPPING"
    NIGHTLIFE = "NIGHTLIFE"
    TRANSPORT = "TRANSPORT"
    ACCOMMODATION = "ACCOMMODATION"
    OTHER = "OTHER"


class TimeMode(str, Enum):
    ANCHOR = "ANCHOR"
    TIME_RANGE = "TIME_RANGE"
    ALL_DAY = "ALL_DAY"


class AssigneeScope(str, Enum):
    GROUP = "GROUP"
    USER = "USER"


class _ActivityBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    system_type: SystemType
    time_mode: TimeMode
    start_time: datetime | None = None
    end_time: datetime | None = None
    location_label: str | None = Field(default=None, max_length=200)
    assignee_scope: AssigneeScope = AssigneeScope.GROUP
    assignee_user_id: UUID | None = None

    @model_validator(mode="after")
    def end_after_start(self):
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class CreateTimelineActivityArgs(_ActivityBase):
    section_id: UUID


class UpdateTimelineActivityArgs(BaseModel):
    activity_id: UUID
    title: str | None = Field(default=None, min_length=1, max_length=200)
    start_time: datetime | None = None
    end_time: datetime | None = None
    location_label: str | None = None


class DeleteTimelineActivityArgs(BaseModel):
    activity_id: UUID


class UpdateTimelineActivityStatusArgs(BaseModel):
    activity_id: UUID
    status: Literal["PLANNED", "IN_PROGRESS", "DONE", "CANCELLED"]


class CreateExpenseArgs(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    total_amount: Decimal = Field(gt=0)
    currency_code: str = Field(min_length=3, max_length=3)
    collector_id: UUID
    description: str | None = Field(default=None, max_length=500)


class UpdateExpenseArgs(BaseModel):
    expense_id: UUID
    title: str | None = Field(default=None, min_length=1, max_length=200)
    total_amount: Decimal | None = Field(default=None, gt=0)


class DeleteExpenseArgs(BaseModel):
    expense_id: UUID


class _Contribution(BaseModel):
    user_id: UUID
    amount: Decimal = Field(ge=0)


class SetExpenseContributionArgs(BaseModel):
    expense_id: UUID
    contributions: list[_Contribution] = Field(min_length=1)


class FinalizeSettlementArgs(BaseModel):
    settlement_id: UUID


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
    message: str = Field(min_length=1, max_length=2000)
