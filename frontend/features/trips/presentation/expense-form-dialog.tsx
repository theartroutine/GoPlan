"use client";

import { Loader2, Plus } from "lucide-react";
import { FormEvent, useState } from "react";

import type { ExpenseResponse } from "@/features/trips/domain/expenses-types";
import { normalizeExpenseMoneyInput } from "@/features/trips/domain/expenses-money";
import { createExpense } from "@/features/trips/infrastructure/expenses-api";
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
  onCreated: (expense: ExpenseResponse) => void | Promise<void>;
};

export function ExpenseFormDialog({
  tripId,
  currencyCode,
  open,
  onOpenChange,
  onCreated,
}: ExpenseFormDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    const normalizedAmount = normalizeExpenseMoneyInput(totalAmount, currencyCode);

    if (!cleanTitle) {
      setError("Nhập tên khoản chi.");
      return;
    }
    if (
      !normalizedAmount.value ||
      Number(normalizedAmount.value) <= 0 ||
      Number.isNaN(Number(normalizedAmount.value))
    ) {
      setError("Nhập tổng tiền hợp lệ.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const expense = await createExpense(tripId, {
        title: cleanTitle,
        description: cleanDescription,
        total_amount: normalizedAmount.value,
      });
      await onCreated(expense);
      resetForm();
      onOpenChange(false);
    } catch {
      setError("Không tạo được khoản chi. Kiểm tra dữ liệu rồi thử lại.");
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
    setError(null);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm khoản chi</DialogTitle>
          <DialogDescription>
            Tạo khoản chi mới cho tất cả thành viên đang active trong chuyến đi.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {error && <FormErrorBanner>{error}</FormErrorBanner>}

          <div className="space-y-2">
            <Label htmlFor="expense-title">Tên khoản chi</Label>
            <Input
              id="expense-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense-description">Mô tả</Label>
            <Textarea
              id="expense-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense-total-amount">Tổng tiền</Label>
            <div className="flex items-center gap-2">
              <Input
                id="expense-total-amount"
                value={totalAmount}
                onChange={(event) => setTotalAmount(event.target.value)}
                inputMode="decimal"
                disabled={submitting}
              />
              <span className="shrink-0 rounded-md border border-border bg-muted px-2.5 py-2 text-xs font-medium text-muted-foreground">
                {currencyCode}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => handleOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Tạo khoản chi
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
