"use client";

import { Check, Loader2, Pencil } from "lucide-react";
import { useState } from "react";

import type {
  ExpenseDetailResponse,
  ExpenseParticipantContribution,
} from "@/features/trips/domain/expenses-types";
import {
  formatExpenseMoney,
  normalizeExpenseMoneyInput,
} from "@/features/trips/domain/expenses-money";
import { setExpenseContribution } from "@/features/trips/infrastructure/expenses-api";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

type ContributionEditorProps = {
  detail: ExpenseDetailResponse;
  tripId: string;
  canManageExpenses: boolean;
  settlementFinalized: boolean;
  onChanged: () => void | Promise<void>;
};

export function ContributionEditor({
  detail,
  tripId,
  canManageExpenses,
  settlementFinalized,
  onChanged,
}: ContributionEditorProps) {
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [draftAmount, setDraftAmount] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readOnly = !canManageExpenses || detail.locked || settlementFinalized;

  function startEditing(participant: ExpenseParticipantContribution) {
    setEditingUserId(participant.user_id);
    setDraftAmount(participant.contributed_amount);
    setError(null);
  }

  async function saveContribution(participant: ExpenseParticipantContribution) {
    const normalizedAmount = normalizeExpenseMoneyInput(draftAmount, detail.currency_code);
    if (
      normalizedAmount.value === null ||
      Number(normalizedAmount.value) < 0 ||
      Number.isNaN(Number(normalizedAmount.value))
    ) {
      setError("Nhập số tiền đóng góp hợp lệ.");
      return;
    }

    setPendingUserId(participant.user_id);
    setError(null);
    try {
      await setExpenseContribution(tripId, detail.id, participant.user_id, {
        amount: normalizedAmount.value,
      });
      setEditingUserId(null);
      await onChanged();
    } catch {
      setError(`Không lưu được đóng góp của ${participant.display_name}.`);
    } finally {
      setPendingUserId(null);
    }
  }

  return (
    <section className="mt-5 space-y-3" aria-label="Contribution snapshot">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Đóng góp theo thành viên</h3>
        {readOnly && (
          <span className="rounded-full border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            Chỉ xem
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        {detail.participants.map((participant) => {
          const isEditing = editingUserId === participant.user_id;
          const isPending = pendingUserId === participant.user_id;

          return (
            <div
              key={participant.user_id}
              className="grid gap-3 border-b border-border p-3 last:border-b-0"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{participant.display_name}</p>
                  {participant.identify_tag && (
                    <p className="truncate text-xs text-muted-foreground">
                      {participant.identify_tag}
                    </p>
                  )}
                </div>
                {!readOnly && !isEditing && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => startEditing(participant)}
                    aria-label={`Sửa đóng góp của ${participant.display_name}`}
                  >
                    <Pencil className="size-4" />
                    Sửa
                  </Button>
                )}
              </div>

              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <MoneyCell
                  label="Phần chia"
                  value={formatExpenseMoney(participant.share_amount, detail.currency_code)}
                />
                <MoneyCell
                  label="Đã đóng"
                  value={formatExpenseMoney(participant.contributed_amount, detail.currency_code)}
                />
                <MoneyCell
                  label="Số dư"
                  value={formatExpenseMoney(participant.balance, detail.currency_code)}
                />
              </div>

              {isEditing && (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-48 flex-1 space-y-1">
                    <Label htmlFor={`contribution-${participant.user_id}`}>
                      Số tiền {participant.display_name} đã đóng
                    </Label>
                    <Input
                      id={`contribution-${participant.user_id}`}
                      value={draftAmount}
                      onChange={(event) => setDraftAmount(event.target.value)}
                      inputMode="decimal"
                      disabled={isPending}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending}
                    onClick={() => void saveContribution(participant)}
                    aria-label={`Lưu đóng góp của ${participant.display_name}`}
                  >
                    {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    Lưu
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => setEditingUserId(null)}
                  >
                    Hủy
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MoneyCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 px-2 py-1.5">
      <span>{label}</span>
      <p className="mt-0.5 font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
