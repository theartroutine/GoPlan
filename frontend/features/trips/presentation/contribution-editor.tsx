"use client";

import { Check, Loader2, Pencil } from "lucide-react";
import { useState } from "react";

import type {
  ExpenseDetailResponse,
  ExpenseParticipantContribution,
} from "@/features/trips/domain/expenses-types";
import { getExpenseErrorMessage } from "@/features/trips/domain/expenses-errors";
import {
  formatExpenseMoney,
  normalizeExpenseMoneyInput,
} from "@/features/trips/domain/expenses-money";
import { setExpenseContribution } from "@/features/trips/infrastructure/expenses-api";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/lib/utils";

type ContributionEditorProps = {
  detail: ExpenseDetailResponse;
  tripId: string;
  canManageExpenses: boolean;
  settlementFinalized: boolean;
  onChanged: (expenseId: string) => void | Promise<void>;
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
      setError("Enter a valid contribution amount.");
      return;
    }

    setPendingUserId(participant.user_id);
    setError(null);
    try {
      await setExpenseContribution(tripId, detail.id, participant.user_id, {
        amount: normalizedAmount.value,
      });
      setEditingUserId(null);
      await onChanged(detail.id);
    } catch (err) {
      setError(
        getExpenseErrorMessage(
          err,
          `Could not save ${participant.display_name}'s contribution.`,
        ),
      );
    } finally {
      setPendingUserId(null);
    }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Contributions
        </p>
        {readOnly && (
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
            View only
          </span>
        )}
      </div>

      {error && (
        <p className="mt-2 rounded border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="mt-2 divide-y divide-border">
        {detail.participants.map((participant) => {
          const isEditing = editingUserId === participant.user_id;
          const isPending = pendingUserId === participant.user_id;
          const balance = parseFloat(participant.balance);
          const isPositive = balance > 0;
          const isNegative = balance < 0;
          const surplusHeld = parseFloat(participant.surplus_held ?? "0");

          return (
            <div key={participant.user_id} className="py-2.5">
              {/* Name row */}
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {participant.display_name}
                  </p>
                  {participant.identify_tag && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {participant.identify_tag}
                    </p>
                  )}
                </div>
                {!readOnly && !isEditing && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => startEditing(participant)}
                    aria-label={`Edit contribution for ${participant.display_name}`}
                  >
                    <Pencil className="size-3" />
                    Edit
                  </Button>
                )}
              </div>

              {/* Amounts row */}
              <div className="mt-1.5 grid grid-cols-3 gap-x-2 text-[11px]">
                <div>
                  <span className="text-muted-foreground/70">Share</span>
                  <p className="mt-0.5 font-semibold tabular-nums text-foreground">
                    {formatExpenseMoney(participant.share_amount, detail.currency_code)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground/70">Contributed</span>
                  <p className="mt-0.5 font-semibold tabular-nums text-foreground">
                    {formatExpenseMoney(participant.contributed_amount, detail.currency_code)}
                  </p>
                </div>
                <div>
                  <span
                    className={cn(
                      "font-medium",
                      isPositive && "text-emerald-600 dark:text-emerald-400",
                      isNegative && "text-rose-600 dark:text-rose-400",
                      !isPositive && !isNegative && "text-muted-foreground/70",
                    )}
                  >
                    {isPositive ? "Overpaid" : isNegative ? "Still owes" : "Settled"}
                  </span>
                  <p
                    className={cn(
                      "mt-0.5 font-semibold tabular-nums",
                      isPositive && "text-emerald-700 dark:text-emerald-300",
                      isNegative && "text-rose-700 dark:text-rose-300",
                      !isPositive && !isNegative && "text-foreground",
                    )}
                  >
                    {isPositive
                      ? `+${formatExpenseMoney(balance, detail.currency_code)}`
                      : formatExpenseMoney(Math.abs(balance), detail.currency_code)}
                  </p>
                </div>
              </div>

              {/* Surplus held indicator */}
              {surplusHeld > 0 && (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                  Holding{" "}
                  <span className="font-semibold tabular-nums">
                    {formatExpenseMoney(surplusHeld, detail.currency_code)}
                  </span>{" "}
                  surplus
                </p>
              )}

              {/* Edit form */}
              {isEditing && (
                <div className="mt-2.5 flex flex-wrap items-end gap-2">
                  <div className="min-w-40 flex-1 space-y-1">
                    <Label
                      htmlFor={`contribution-${participant.user_id}`}
                      className="text-xs"
                    >
                      Amount {participant.display_name} contributed
                    </Label>
                    <Input
                      id={`contribution-${participant.user_id}`}
                      value={draftAmount}
                      onChange={(e) => setDraftAmount(e.target.value)}
                      inputMode="decimal"
                      disabled={isPending}
                      className="h-8 text-sm"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8"
                    disabled={isPending}
                    onClick={() => void saveContribution(participant)}
                    aria-label={`Save contribution for ${participant.display_name}`}
                  >
                    {isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    disabled={isPending}
                    onClick={() => setEditingUserId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
