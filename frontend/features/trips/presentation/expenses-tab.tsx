"use client";

import { Plus, RefreshCcw, ShieldCheck, WalletCards } from "lucide-react";
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ExpenseDashboardResponse,
  ExpenseListItem,
} from "@/features/trips/domain/expenses-types";
import { useAuth } from "@/features/auth/application/auth-context";
import { DEFAULT_TRIP_CURRENCY } from "@/features/trips/domain/money";
import { getExpensesDashboard } from "@/features/trips/infrastructure/expenses-api";
import { ExpenseCard } from "@/features/trips/presentation/expense-card";
import { ExpenseDetailPanel } from "@/features/trips/presentation/expense-detail-panel";
import { ExpenseSummaryStrip } from "@/features/trips/presentation/expense-summary-strip";
import { SettlementPanel } from "@/features/trips/presentation/settlement-panel";
import { useTripContext } from "@/features/trips/presentation/trip-context";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

export function ExpensesTab() {
  const { tripId } = useTripContext();
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<ExpenseDashboardResponse | null>(null);
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const loadDashboard = useCallback(async () => {
    activeRequestRef.current?.abort();

    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;

    activeRequestRef.current = controller;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    try {
      const result = await getExpensesDashboard(tripId, { signal: controller.signal });

      if (!isActiveRequest(controller, requestId, activeRequestRef, requestIdRef)) return;

      setDashboard(result);
      setSelectedExpenseId((current) => {
        if (current && result.expenses.some((expense) => expense.id === current)) return current;
        return result.expenses[0]?.id ?? null;
      });
    } catch {
      if (!isActiveRequest(controller, requestId, activeRequestRef, requestIdRef)) return;

      setError("Không tải được dashboard chi phí.");
      setDashboard(null);
      setSelectedExpenseId(null);
    } finally {
      if (isActiveRequest(controller, requestId, activeRequestRef, requestIdRef)) {
        setLoading(false);
        activeRequestRef.current = null;
      }
    }
  }, [tripId]);

  useEffect(() => {
    void loadDashboard();

    return () => {
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      requestIdRef.current += 1;
    };
  }, [loadDashboard]);

  const selectedExpense = useMemo(
    () => findSelectedExpense(dashboard?.expenses ?? [], selectedExpenseId),
    [dashboard?.expenses, selectedExpenseId],
  );

  if (loading && !dashboard) return <ExpensesLoadingState />;

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
        <p className="text-sm font-semibold text-destructive">{error}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Kiểm tra kết nối rồi thử tải lại dashboard.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => void loadDashboard()}
        >
          <RefreshCcw className="size-4" />
          Thử lại
        </Button>
      </div>
    );
  }

  if (!dashboard) return null;

  const canManageExpenses = dashboard.permissions.can_manage_expenses;
  const dashboardCurrencyCode = dashboard.expenses[0]?.currency_code || DEFAULT_TRIP_CURRENCY;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Chi phí chuyến đi</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Theo dõi tổng tiền, số đã thu và trạng thái từng khoản chi.
          </p>
        </div>

        {canManageExpenses ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Sẽ mở ở task sau
            </span>
            <Button type="button" disabled>
              <Plus className="size-4" />
              Thêm khoản chi
            </Button>
          </div>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            Chế độ xem
          </span>
        )}
      </div>

      <ExpenseSummaryStrip dashboard={dashboard} />

      <SettlementPanel
        tripId={tripId}
        settlement={dashboard.settlement}
        currentUserId={user?.id ?? null}
        currencyCode={dashboardCurrencyCode}
        onChanged={loadDashboard}
      />

      {dashboard.expenses.length === 0 ? (
        <ExpensesEmptyState canManageExpenses={canManageExpenses} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <section className="space-y-3" aria-label="Expense list">
            {dashboard.expenses.map((expense, index) => (
              <ExpenseCard
                key={expense.id}
                expense={expense}
                selected={expense.id === selectedExpense?.id}
                onSelect={() => setSelectedExpenseId(expense.id)}
                animationDelay={index * 65}
              />
            ))}
          </section>
          <ExpenseDetailPanel expense={selectedExpense} />
        </div>
      )}
    </div>
  );
}

function ExpensesLoadingState() {
  return (
    <div data-testid="expenses-loading" className="flex flex-col items-center justify-center py-16">
      <Spinner className="size-8 text-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">Đang tải dashboard chi phí...</p>
    </div>
  );
}

function ExpensesEmptyState({ canManageExpenses }: { canManageExpenses: boolean }) {
  return (
    <section className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <WalletCards className="size-5" />
      </div>
      <h2 className="mt-4 text-base font-semibold">Chưa có khoản chi nào</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Dashboard sẽ hiển thị tổng tiền và tiến độ đóng góp khi có khoản chi đầu tiên.
      </p>
      {canManageExpenses && (
        <Button type="button" className="mt-5" disabled>
          <Plus className="size-4" />
          Thêm khoản chi
        </Button>
      )}
    </section>
  );
}

function findSelectedExpense(
  expenses: ExpenseListItem[],
  selectedExpenseId: string | null,
): ExpenseListItem | null {
  if (expenses.length === 0) return null;
  return expenses.find((expense) => expense.id === selectedExpenseId) ?? expenses[0];
}

function isActiveRequest(
  controller: AbortController,
  requestId: number,
  activeRequestRef: RefObject<AbortController | null>,
  requestIdRef: RefObject<number>,
) {
  return (
    !controller.signal.aborted &&
    activeRequestRef.current === controller &&
    requestIdRef.current === requestId
  );
}
