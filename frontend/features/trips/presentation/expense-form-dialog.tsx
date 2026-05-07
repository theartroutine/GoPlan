"use client";

import { Loader2, Pencil, Plus } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import type { TripMemberItem } from "@/features/trips/domain/types";
import type {
  ExpenseDetailResponse,
  ExpenseListItem,
  ExpenseResponse,
  UpdateExpensePayload,
} from "@/features/trips/domain/expenses-types";
import { getExpenseErrorMessage } from "@/features/trips/domain/expenses-errors";
import { normalizeExpenseMoneyInput } from "@/features/trips/domain/expenses-money";
import { apiBudgetToInputValue } from "@/features/trips/domain/money";
import {
  createExpense,
  updateExpense,
} from "@/features/trips/infrastructure/expenses-api";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { FormErrorBanner } from "@/shared/ui/form-error-banner";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

type ExpenseFormDialogProps = {
  tripId: string;
  currencyCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  expense?: ExpenseListItem | ExpenseDetailResponse | null;
  members?: TripMemberItem[];
  onCreated?: (expense: ExpenseResponse) => void | Promise<void>;
  onUpdated?: (expense: ExpenseDetailResponse) => void | Promise<void>;
};

export function ExpenseFormDialog({
  tripId,
  currencyCode,
  open,
  onOpenChange,
  mode = "create",
  expense = null,
  members = [],
  onCreated,
  onUpdated,
}: ExpenseFormDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [collectorId, setCollectorId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditMode = mode === "edit";

  useEffect(() => {
    if (!open) return;
    if (!isEditMode || !expense) {
      resetForm();
      return;
    }

    setTitle(expense.title);
    setDescription(expense.description);
    setTotalAmount(apiBudgetToInputValue(expense.total_amount, expense.currency_code));
    setCollectorId(expense.collector.id);
    setError(null);
  }, [expense, isEditMode, open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    const normalizedAmount = normalizeExpenseMoneyInput(totalAmount, currencyCode);

    if (!cleanTitle) {
      setError("Enter an expense name.");
      return;
    }
    if (
      !normalizedAmount.value ||
      Number(normalizedAmount.value) <= 0 ||
      Number.isNaN(Number(normalizedAmount.value))
    ) {
      setError("Enter a valid total amount.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (isEditMode) {
        if (!expense) {
          setError("Could not find the expense to update.");
          return;
        }

        const payload: UpdateExpensePayload = {
          title: cleanTitle,
          description: cleanDescription,
          total_amount: normalizedAmount.value,
        };
        if (collectorId && collectorId !== expense.collector.id) {
          payload.collector_id = collectorId;
        }

        const updatedExpense = await updateExpense(tripId, expense.id, payload);
        await onUpdated?.(updatedExpense);
      } else {
        const payload = {
          title: cleanTitle,
          description: cleanDescription,
          total_amount: normalizedAmount.value,
          ...(collectorId ? { collector_id: collectorId } : {}),
        };
        const createdExpense = await createExpense(tripId, payload);
        await onCreated?.(createdExpense);
      }

      resetForm();
      onOpenChange(false);
    } catch (err) {
      setError(
        getExpenseErrorMessage(
          err,
          isEditMode
            ? "Could not save the expense. Check the data and try again."
            : "Could not create the expense. Check the data and try again.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (submitting) return;
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setTotalAmount("");
    setCollectorId("");
    setError(null);
  }

  const titleId = isEditMode ? "edit-expense-title" : "expense-title";
  const descriptionId = isEditMode ? "edit-expense-description" : "expense-description";
  const totalAmountId = isEditMode ? "edit-expense-total-amount" : "expense-total-amount";
  const collectorIdField = isEditMode ? "edit-expense-collector" : "expense-collector";
  const dialogTitle = isEditMode ? "Edit expense" : "Add expense";
  const submitLabel = isEditMode ? "Save expense" : "Create expense";
  const showCurrentCollectorOption =
    isEditMode &&
    Boolean(collectorId) &&
    !members.some((member) => member.user.id === collectorId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update the expense details and collector for the current settlement."
              : "Create a new expense for all active trip members."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {error && <FormErrorBanner>{error}</FormErrorBanner>}

          <div className="space-y-2">
            <Label htmlFor={titleId}>Expense name</Label>
            <Input
              id={titleId}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              disabled={submitting}
              required
              aria-required="true"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={descriptionId}>Description</Label>
            <Textarea
              id={descriptionId}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={totalAmountId}>Total amount</Label>
            <div className="flex items-center gap-2">
              <Input
                id={totalAmountId}
                value={totalAmount}
                onChange={(event) => setTotalAmount(event.target.value)}
                inputMode="decimal"
                disabled={submitting}
                required
                aria-required="true"
              />
              <span className="shrink-0 rounded-md border border-border bg-muted px-2.5 py-2 text-xs font-medium text-muted-foreground">
                {currencyCode}
              </span>
            </div>
          </div>

          {members.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor={collectorIdField}>Collector</Label>
              <div className="relative">
                <select
                  id={collectorIdField}
                  value={collectorId}
                  onChange={(event) => setCollectorId(event.target.value)}
                  disabled={submitting}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
                >
                  {!isEditMode && <option value="">Expense creator</option>}
                  {showCurrentCollectorOption && (
                    <option value={collectorId}>
                      {expense?.collector.display_name ?? "Current collector"} (left trip)
                    </option>
                  )}
                  {members.map((member) => (
                    <option key={member.user.id} value={member.user.id}>
                      {member.user.display_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : isEditMode ? (
                <Pencil className="size-4" />
              ) : (
                <Plus className="size-4" />
              )}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
