"use client";

import {
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  WalletCards,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ExpenseDashboardResponse,
  ExpenseDetailResponse,
  ExpenseListItem,
  ExpenseResponse,
} from "@/features/trips/domain/expenses-types";
import { useAuth } from "@/features/auth/application/auth-context";
import { getExpenseErrorMessage } from "@/features/trips/domain/expenses-errors";
import {
  deleteExpense,
  finalizeSettlement,
  getExpenseDetail,
  getExpensesDashboard,
  reopenSettlement,
} from "@/features/trips/infrastructure/expenses-api";
import { ExpenseDetailDrawer } from "@/features/trips/presentation/expense-detail-drawer";
import { ExpenseFormDialog } from "@/features/trips/presentation/expense-form-dialog";
import { ExpenseListControls } from "@/features/trips/presentation/expense-list-controls";
import { ExpenseListRow } from "@/features/trips/presentation/expense-list-row";
import {
  ExpensePersonalBalanceCard,
  ExpenseSummaryStrip,
} from "@/features/trips/presentation/expense-summary-strip";
import {
  buildExpensesHref,
  filterExpenses,
  getNearestExpenseIdAfterDelete,
  resolveExpensesUrlState,
  type ExpenseFilter,
} from "@/features/trips/presentation/expenses-url-state";
import { SettlementPanel } from "@/features/trips/presentation/settlement-panel";
import { useTripContext } from "@/features/trips/presentation/trip-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

type SettlementAction = "finalize" | "reopen";

const EMPTY_EXPENSES: ExpenseListItem[] = [];

export function ExpensesTab() {
  const { tripId, data: tripData } = useTripContext();
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dashboard, setDashboard] = useState<ExpenseDashboardResponse | null>(null);
  const [selectedExpenseDetail, setSelectedExpenseDetail] =
    useState<ExpenseDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [expenseForEdit, setExpenseForEdit] =
    useState<ExpenseListItem | ExpenseDetailResponse | null>(null);
  const [expensePendingDelete, setExpensePendingDelete] =
    useState<ExpenseListItem | ExpenseDetailResponse | null>(null);
  const [expenseActionPending, setExpenseActionPending] = useState(false);
  const [settlementAction, setSettlementAction] = useState<SettlementAction | null>(null);
  const [settlementActionPending, setSettlementActionPending] = useState(false);
  const [settlementActionError, setSettlementActionError] = useState<string | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [optimisticSearch, setOptimisticSearch] = useState<string | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const activeDetailRequestRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const latestRequestedSearchRef = useRef<string | null>(null);
  const selectedExpenseIdRef = useRef<string | null>(null);
  const routeSearch = searchParams.toString();
  const effectiveSearch = optimisticSearch ?? routeSearch;
  const dashboardExpenses = dashboard?.expenses ?? EMPTY_EXPENSES;
  const expenseUrlState = useMemo(
    () =>
      resolveExpensesUrlState({
        pathname,
        search: effectiveSearch,
        expenses: dashboardExpenses,
      }),
    [dashboardExpenses, effectiveSearch, pathname],
  );
  const selectedExpenseId = expenseUrlState.selectedExpenseId;
  selectedExpenseIdRef.current = selectedExpenseId;
  const selectedExpense = useMemo(
    () => findSelectedExpense(dashboardExpenses, selectedExpenseId),
    [dashboardExpenses, selectedExpenseId],
  );
  const filterCounts = useMemo(() => getFilterCounts(dashboardExpenses), [dashboardExpenses]);

  useEffect(() => {
    if (optimisticSearch === null) return;
    if (routeSearch !== latestRequestedSearchRef.current) return;

    setOptimisticSearch(null);
    latestRequestedSearchRef.current = null;
  }, [optimisticSearch, routeSearch]);

  const replaceExpensesUrl = useCallback(
    (href: string) => {
      const nextSearch = href.split("?")[1] ?? "";
      latestRequestedSearchRef.current = nextSearch;
      router.replace(href, { scroll: false });
      setOptimisticSearch(nextSearch);
    },
    [router],
  );

  const updateExpenseUrlState = useCallback(
    ({
      expenseId,
      filter,
      query,
    }: {
      expenseId: string | null;
      filter: ExpenseFilter;
      query: string;
    }) => {
      replaceExpensesUrl(buildExpensesHref(pathname, effectiveSearch, { expenseId, filter, query }));
    },
    [effectiveSearch, pathname, replaceExpensesUrl],
  );

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
    } catch (err) {
      if (!isActiveRequest(controller, requestId, activeRequestRef, requestIdRef)) return;

      setError(getExpenseErrorMessage(err, "Could not load the expenses dashboard."));
      setDashboard(null);
      setSelectedExpenseDetail(null);
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
      activeDetailRequestRef.current?.abort();
      activeRequestRef.current = null;
      activeDetailRequestRef.current = null;
      requestIdRef.current += 1;
      detailRequestIdRef.current += 1;
    };
  }, [loadDashboard]);

  useEffect(() => {
    if (!dashboard || loading || !expenseUrlState.replacementHref) return;

    replaceExpensesUrl(expenseUrlState.replacementHref);
  }, [dashboard, expenseUrlState.replacementHref, loading, replaceExpensesUrl]);

  const loadSelectedExpenseDetail = useCallback(
    async (expenseId: string) => {
      activeDetailRequestRef.current?.abort();

      const controller = new AbortController();
      const requestId = detailRequestIdRef.current + 1;

      activeDetailRequestRef.current = controller;
      detailRequestIdRef.current = requestId;
      setDetailLoading(true);
      setDetailError(null);

      try {
        const result = await getExpenseDetail(tripId, expenseId, { signal: controller.signal });

        if (!isActiveRequest(controller, requestId, activeDetailRequestRef, detailRequestIdRef)) {
          return;
        }

        setSelectedExpenseDetail(result);
      } catch (err) {
        if (!isActiveRequest(controller, requestId, activeDetailRequestRef, detailRequestIdRef)) {
          return;
        }

        setSelectedExpenseDetail(null);
        setDetailError(getExpenseErrorMessage(err, "Could not load contribution details."));
      } finally {
        if (isActiveRequest(controller, requestId, activeDetailRequestRef, detailRequestIdRef)) {
          setDetailLoading(false);
          activeDetailRequestRef.current = null;
        }
      }
    },
    [tripId],
  );

  useEffect(() => {
    if (!selectedExpenseId) {
      activeDetailRequestRef.current?.abort();
      activeDetailRequestRef.current = null;
      detailRequestIdRef.current += 1;
      setSelectedExpenseDetail(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    void loadSelectedExpenseDetail(selectedExpenseId);

    return () => {
      activeDetailRequestRef.current?.abort();
      activeDetailRequestRef.current = null;
      detailRequestIdRef.current += 1;
    };
  }, [loadSelectedExpenseDetail, selectedExpenseId]);

  useEffect(() => {
    if (!selectedExpenseId) setDetailDrawerOpen(false);
  }, [selectedExpenseId]);

  const tripMembers = tripData?.members ?? [];

  if (loading && !dashboard) return <ExpensesLoadingState />;

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
        <p className="text-sm font-semibold text-destructive">{error}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Check your connection, then try loading the dashboard again.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => void loadDashboard()}
        >
          <RefreshCcw className="size-4" />
          Try again
        </Button>
      </div>
    );
  }

  if (!dashboard) return null;

  const canManageExpenses = dashboard.permissions.can_manage_expenses;
  const dashboardCurrencyCode = dashboard.currency_code;
  const settlementFinalized = dashboard.settlement?.status === "FINALIZED";
  const canCreateExpense = canManageExpenses && !settlementFinalized;
  const settlementActionCopy = getSettlementActionCopy(settlementAction);

  async function handleExpenseCreated(expense: ExpenseResponse) {
    updateExpenseUrlState({ expenseId: expense.id, filter: "all", query: "" });
    await loadDashboard();
  }

  async function handleExpenseUpdated(expense: ExpenseDetailResponse) {
    updateExpenseUrlState({
      expenseId: expense.id,
      filter: expenseUrlState.filter,
      query: expenseUrlState.query,
    });
    setSelectedExpenseDetail(expense);
    await loadDashboard();
  }

  async function handleExpenseDeleted() {
    if (!expensePendingDelete || expenseActionPending) return;

    setExpenseActionPending(true);
    setDetailError(null);
    try {
      await deleteExpense(tripId, expensePendingDelete.id);
      const nextExpenseId = getNearestExpenseIdAfterDelete(
        expenseUrlState.visibleExpenses,
        expensePendingDelete.id,
      );

      updateExpenseUrlState({
        expenseId: nextExpenseId,
        filter: expenseUrlState.filter,
        query: expenseUrlState.query,
      });
      setExpensePendingDelete(null);
      setSelectedExpenseDetail(null);
      setDetailDrawerOpen(false);
      await loadDashboard();
    } catch (err) {
      setDetailError(getExpenseErrorMessage(err, "Could not delete the expense. Try again later."));
    } finally {
      setExpenseActionPending(false);
    }
  }

  function handleFilterChange(filter: ExpenseFilter) {
    const visibleExpenses = filterExpenses(dashboardExpenses, filter, expenseUrlState.query);
    const nextExpenseId =
      visibleExpenses.some((expense) => expense.id === selectedExpenseId)
        ? selectedExpenseId
        : visibleExpenses[0]?.id ?? null;

    updateExpenseUrlState({ expenseId: nextExpenseId, filter, query: expenseUrlState.query });
  }

  function handleQueryChange(query: string) {
    const visibleExpenses = filterExpenses(dashboardExpenses, expenseUrlState.filter, query);
    const nextExpenseId =
      visibleExpenses.some((expense) => expense.id === selectedExpenseId)
        ? selectedExpenseId
        : visibleExpenses[0]?.id ?? null;

    updateExpenseUrlState({ expenseId: nextExpenseId, filter: expenseUrlState.filter, query });
  }

  function handleExpenseSelected(expenseId: string) {
    updateExpenseUrlState({
      expenseId,
      filter: expenseUrlState.filter,
      query: expenseUrlState.query,
    });
    setDetailDrawerOpen(true);
  }

  async function handleContributionChanged(changedExpenseId: string) {
    if (selectedExpenseIdRef.current === changedExpenseId) {
      await loadSelectedExpenseDetail(changedExpenseId);
    }
    await loadDashboard();
  }

  async function handleSettlementAction() {
    if (!settlementAction || settlementActionPending) return;

    setSettlementActionPending(true);
    setSettlementActionError(null);
    try {
      if (settlementAction === "finalize") {
        await finalizeSettlement(tripId);
      } else {
        await reopenSettlement(tripId);
      }

      setSettlementAction(null);
      await loadDashboard();
    } catch (err) {
      setSettlementActionError(
        getExpenseErrorMessage(
          err,
          settlementAction === "finalize"
            ? "Could not finalize the settlement. Check missing contributions and try again."
            : "Could not reopen the settlement. Try again later.",
        ),
      );
    } finally {
      setSettlementActionPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canCreateExpense ? (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSettlementAction("finalize")}
            >
              <CheckCircle2 className="size-4" />
              Finalize settlement
            </Button>
            <Button type="button" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="size-4" />
              Add expense
            </Button>
          </>
        ) : canManageExpenses && settlementFinalized ? (
          <>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              Settlement finalized. Expenses are locked.
            </span>
            <Button type="button" variant="outline" onClick={() => setSettlementAction("reopen")}>
              <RotateCcw className="size-4" />
              Reopen settlement
            </Button>
          </>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            View mode
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

      {settlementActionError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">
          {settlementActionError}
        </div>
      )}

      <ExpenseFormDialog
        tripId={tripId}
        currencyCode={dashboardCurrencyCode}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        members={tripMembers}
        onCreated={handleExpenseCreated}
      />

      <ExpenseFormDialog
        tripId={tripId}
        currencyCode={dashboardCurrencyCode}
        mode="edit"
        expense={expenseForEdit}
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setExpenseForEdit(null);
        }}
        members={tripMembers}
        onUpdated={handleExpenseUpdated}
      />

      <SettlementActionDialog
        action={settlementAction}
        actionCopy={settlementActionCopy}
        pending={settlementActionPending}
        onOpenChange={(open) => {
          if (!open && !settlementActionPending) setSettlementAction(null);
        }}
        onConfirm={handleSettlementAction}
      />

      <DeleteExpenseDialog
        expense={expensePendingDelete}
        pending={expenseActionPending}
        onOpenChange={(open) => {
          if (!open && !expenseActionPending) setExpensePendingDelete(null);
        }}
        onConfirm={handleExpenseDeleted}
      />

      {dashboard.expenses.length === 0 ? (
        <ExpensesEmptyState
          canCreateExpense={canCreateExpense}
          onCreate={() => setCreateDialogOpen(true)}
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start xl:gap-x-4">
          <div className="min-w-0 xl:col-start-1 xl:row-start-1">
            <ExpenseListControls
              filter={expenseUrlState.filter}
              query={expenseUrlState.query}
              counts={filterCounts}
              onFilterChange={handleFilterChange}
              onQueryChange={handleQueryChange}
            />
          </div>

          <section className="min-w-0 xl:col-start-1 xl:row-start-2" aria-label="Expense list">
            {expenseUrlState.visibleExpenses.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-center">
                <p className="text-sm font-medium text-foreground">
                  No matching expenses found.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try changing the filter or clearing the search term.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                {expenseUrlState.visibleExpenses.map((expense) => (
                  <ExpenseListRow
                    key={expense.id}
                    expense={expense}
                    selected={expense.id === selectedExpense?.id}
                    onSelect={() => handleExpenseSelected(expense.id)}
                  />
                ))}
              </div>
            )}
          </section>

          <div className="min-w-0 xl:col-start-2 xl:row-start-2 xl:sticky xl:top-4 xl:self-start">
            <ExpensePersonalBalanceCard dashboard={dashboard} />
          </div>
        </div>
      )}

      <ExpenseDetailDrawer
        open={detailDrawerOpen && selectedExpense !== null}
        onOpenChange={setDetailDrawerOpen}
        expense={selectedExpense}
        detail={selectedExpenseDetail}
        detailLoading={detailLoading}
        detailError={detailError}
        tripId={tripId}
        settlementFinalized={settlementFinalized}
        onContributionChanged={handleContributionChanged}
        onEditExpense={(expense) => {
          setExpenseForEdit(expense);
          setEditDialogOpen(true);
        }}
        onDeleteExpense={setExpensePendingDelete}
      />
    </div>
  );
}

function SettlementActionDialog({
  action,
  actionCopy,
  pending,
  onOpenChange,
  onConfirm,
}: {
  action: SettlementAction | null;
  actionCopy: ReturnType<typeof getSettlementActionCopy>;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}) {
  if (!actionCopy) return null;

  return (
    <AlertDialog open={action !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{actionCopy.title}</AlertDialogTitle>
          <AlertDialogDescription>{actionCopy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={() => void onConfirm()}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {actionCopy.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteExpenseDialog({
  expense,
  pending,
  onOpenChange,
  onConfirm,
}: {
  expense: ExpenseListItem | ExpenseDetailResponse | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <AlertDialog open={expense !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete expense?</AlertDialogTitle>
          <AlertDialogDescription>
            {expense ? `Expense "${expense.title}"` : "This expense"} and its related contributions
            will be removed from the open settlement.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() => void onConfirm()}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Confirm delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function getSettlementActionCopy(action: SettlementAction | null) {
  if (action === "finalize") {
    return {
      title: "Finalize settlement?",
      description:
        "After finalizing, expenses are locked and the system creates transfers between members.",
      confirmLabel: "Finalize",
    };
  }

  if (action === "reopen") {
    return {
      title: "Reopen settlement?",
      description:
        "The current settlement will reopen so the captain can edit expenses or contributions before finalizing again.",
      confirmLabel: "Reopen",
    };
  }

  return null;
}

function ExpensesLoadingState() {
  return (
    <div data-testid="expenses-loading" className="flex flex-col items-center justify-center py-16">
      <Spinner className="size-8 text-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">Loading expenses dashboard...</p>
    </div>
  );
}

function ExpensesEmptyState({
  canCreateExpense,
  onCreate,
}: {
  canCreateExpense: boolean;
  onCreate: () => void;
}) {
  return (
    <section className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <WalletCards className="size-5" />
      </div>
      <h2 className="mt-4 text-base font-semibold">No expenses yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        The dashboard will show totals and contribution progress after the first expense is added.
      </p>
      {canCreateExpense && (
        <Button type="button" className="mt-5" onClick={onCreate}>
          <Plus className="size-4" />
          Add expense
        </Button>
      )}
    </section>
  );
}

function findSelectedExpense(
  expenses: ExpenseListItem[],
  selectedExpenseId: string | null,
): ExpenseListItem | null {
  if (!selectedExpenseId) return null;
  return expenses.find((expense) => expense.id === selectedExpenseId) ?? null;
}

function getFilterCounts(expenses: ExpenseListItem[]) {
  return {
    all: filterExpenses(expenses, "all", "").length,
    attention: filterExpenses(expenses, "attention", "").length,
    missing: filterExpenses(expenses, "missing", "").length,
    overfunded: filterExpenses(expenses, "overfunded", "").length,
  };
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
