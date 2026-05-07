"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";

import type {
  ExpenseDetailResponse,
  ExpenseListItem,
} from "@/features/trips/domain/expenses-types";
import { ExpenseDetailPanel } from "@/features/trips/presentation/expense-detail-panel";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

type ExpenseDetailDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: ExpenseListItem | null;
  detail: ExpenseDetailResponse | null;
  detailLoading: boolean;
  detailError: string | null;
  tripId: string;
  mutationLockReason: "settlement" | "terminal" | null;
  onContributionChanged: (expenseId: string) => void | Promise<void>;
  onEditExpense: (expense: ExpenseListItem | ExpenseDetailResponse) => void;
  onDeleteExpense: (expense: ExpenseListItem | ExpenseDetailResponse) => void;
};

export function ExpenseDetailDrawer({
  open,
  onOpenChange,
  expense,
  detail,
  detailLoading,
  detailError,
  tripId,
  mutationLockReason,
  onContributionChanged,
  onEditExpense,
  onDeleteExpense,
}: ExpenseDetailDrawerProps) {
  return (
    <DialogPrimitive.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          onInteractOutside={() => onOpenChange(false)}
          className={cn(
            "fixed bottom-0 right-0 top-0 z-50 flex h-dvh w-[min(480px,calc(100vw-16px))] flex-col overflow-hidden border-l border-border bg-background shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=closed]:duration-200",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=open]:duration-300 data-[state=open]:ease-out",
            "motion-reduce:animate-none",
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            {expense ? `Details for ${expense.title}` : "Expense details"}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            View finances and contributions for the selected expense.
          </DialogPrimitive.Description>
          <div className="flex h-11 shrink-0 items-center justify-end border-b border-border bg-background px-3">
            <DialogPrimitive.Close asChild>
              <Button
                aria-label="Close expense details"
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <ExpenseDetailPanel
              className="min-h-full rounded-none border-0"
              expense={expense}
              detail={detail}
              detailLoading={detailLoading}
              detailError={detailError}
              tripId={tripId}
              mutationLockReason={mutationLockReason}
              onContributionChanged={onContributionChanged}
              onEditExpense={onEditExpense}
              onDeleteExpense={onDeleteExpense}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
