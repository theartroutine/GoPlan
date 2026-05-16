from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Type

from pydantic import BaseModel

from ai.agent import schemas


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    schema: Type[BaseModel]
    handler: Callable

    def openai_param(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.schema.model_json_schema(),
            },
        }


def _h(name: str) -> Callable:
    from ai.agent import handlers
    return getattr(handlers, name)


TOOLS: list[ToolSpec] = [
    ToolSpec("create_timeline_activity",
             "Draft a new activity on a specific timeline day.",
             schemas.CreateTimelineActivityArgs, _h("create_timeline_activity")),
    ToolSpec("update_timeline_activity",
             "Draft updates to an existing activity.",
             schemas.UpdateTimelineActivityArgs, _h("update_timeline_activity")),
    ToolSpec("delete_timeline_activity",
             "Draft deletion of an existing activity.",
             schemas.DeleteTimelineActivityArgs, _h("delete_timeline_activity")),
    ToolSpec("update_timeline_activity_status",
             "Draft a status change for an existing activity.",
             schemas.UpdateTimelineActivityStatusArgs, _h("update_timeline_activity_status")),
    ToolSpec("create_expense",
             "Draft a new expense for the trip.",
             schemas.CreateExpenseArgs, _h("create_expense")),
    ToolSpec("update_expense",
             "Draft updates to an existing expense.",
             schemas.UpdateExpenseArgs, _h("update_expense")),
    ToolSpec("delete_expense",
             "Draft deletion of an existing expense.",
             schemas.DeleteExpenseArgs, _h("delete_expense")),
    ToolSpec("set_expense_contribution",
             "Draft expense contributions. When the user says everyone/all participants already paid enough, use scope='all_participants_paid' instead of manually splitting amounts.",
             schemas.SetExpenseContributionArgs, _h("set_expense_contribution")),
    ToolSpec("finalize_settlement",
             "Draft finalizing the trip's current settlement.",
             schemas.FinalizeSettlementArgs, _h("finalize_settlement")),
    ToolSpec("reopen_settlement",
             "Draft reopening a finalized settlement.",
             schemas.ReopenSettlementArgs, _h("reopen_settlement")),
    ToolSpec("mark_transfer_sent",
             "Draft marking a transfer as sent.",
             schemas.MarkTransferSentArgs, _h("mark_transfer_sent")),
    ToolSpec("confirm_transfer_received",
             "Draft confirming a transfer was received.",
             schemas.ConfirmTransferReceivedArgs, _h("confirm_transfer_received")),
    ToolSpec("update_action_draft",
             "Update a pending NEEDS_INFO draft with new information the user just provided.",
             schemas.UpdateActionDraftArgs, _h("update_action_draft")),
    ToolSpec("respond_to_user",
             "Reply to the user with a plain text message (no action).",
             schemas.RespondToUserArgs, _h("respond_to_user")),
]


_BY_NAME = {t.name: t for t in TOOLS}


def openai_tool_params() -> list[dict]:
    return [t.openai_param() for t in TOOLS]


def resolve_tool(name: str) -> ToolSpec:
    if name not in _BY_NAME:
        raise KeyError(name)
    return _BY_NAME[name]
