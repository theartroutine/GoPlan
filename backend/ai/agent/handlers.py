"""Tool handlers — wired in Task 11. This stub keeps the registry importable."""
from __future__ import annotations


def _todo(name: str):
    def _stub(**kwargs):
        raise NotImplementedError(f"handler {name} not implemented")
    _stub.__name__ = name
    return _stub


create_timeline_activity = _todo("create_timeline_activity")
update_timeline_activity = _todo("update_timeline_activity")
delete_timeline_activity = _todo("delete_timeline_activity")
update_timeline_activity_status = _todo("update_timeline_activity_status")
create_expense = _todo("create_expense")
update_expense = _todo("update_expense")
delete_expense = _todo("delete_expense")
set_expense_contribution = _todo("set_expense_contribution")
finalize_settlement = _todo("finalize_settlement")
reopen_settlement = _todo("reopen_settlement")
mark_transfer_sent = _todo("mark_transfer_sent")
confirm_transfer_received = _todo("confirm_transfer_received")
update_action_draft = _todo("update_action_draft")
respond_to_user = _todo("respond_to_user")
