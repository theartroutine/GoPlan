import type { ExpenseListItem } from "@/features/trips/domain/expenses-types";

export type ExpenseFilter = "all" | "attention" | "missing" | "overfunded";

type SearchSource = string | URLSearchParams | { toString(): string };

export type ExpensesUrlState = {
  filter: ExpenseFilter;
  query: string;
  visibleExpenses: ExpenseListItem[];
  selectedExpenseId: string | null;
  replacementHref: string | null;
};

const FILTERS = new Set<ExpenseFilter>(["all", "attention", "missing", "overfunded"]);

export function filterExpenses(
  expenses: ExpenseListItem[],
  filter: ExpenseFilter,
  query: string,
): ExpenseListItem[] {
  const normalizedQuery = normalizeQuery(query);

  return expenses.filter((expense) => {
    if (!matchesFilter(expense, filter)) return false;
    if (!normalizedQuery) return true;

    return getSearchText(expense).includes(normalizedQuery);
  });
}

export function resolveExpensesUrlState({
  pathname,
  search,
  expenses,
}: {
  pathname: string;
  search: SearchSource;
  expenses: ExpenseListItem[];
}): ExpensesUrlState {
  const params = toParams(search);
  const rawFilter = params.get("filter");
  const filter = isExpenseFilter(rawFilter) ? rawFilter : "all";
  const query = params.get("q")?.trim() ?? "";
  const visibleExpenses = filterExpenses(expenses, filter, query);
  const requestedExpenseId = params.get("expense");
  const selectedExpenseId =
    visibleExpenses.find((expense) => expense.id === requestedExpenseId)?.id ??
    visibleExpenses[0]?.id ??
    null;

  const canonicalHref = buildExpensesHref(pathname, params, {
    expenseId: selectedExpenseId,
    filter,
    query,
  });
  const currentHref = toHref(pathname, params);

  return {
    filter,
    query,
    visibleExpenses,
    selectedExpenseId,
    replacementHref: canonicalHref === currentHref ? null : canonicalHref,
  };
}

export function buildExpensesHref(
  pathname: string,
  search: SearchSource,
  state: {
    expenseId: string | null;
    filter: ExpenseFilter;
    query: string;
  },
): string {
  const params = toParams(search);

  if (state.expenseId) {
    params.set("expense", state.expenseId);
  } else {
    params.delete("expense");
  }

  if (state.filter === "all") {
    params.delete("filter");
  } else {
    params.set("filter", state.filter);
  }

  const cleanQuery = state.query.trim();
  if (cleanQuery) {
    params.set("q", cleanQuery);
  } else {
    params.delete("q");
  }

  return toHref(pathname, params);
}

export function getNearestExpenseIdAfterDelete(
  visibleExpensesBeforeDelete: ExpenseListItem[],
  deletedExpenseId: string,
): string | null {
  const deletedIndex = visibleExpensesBeforeDelete.findIndex(
    (expense) => expense.id === deletedExpenseId,
  );

  if (deletedIndex < 0) return visibleExpensesBeforeDelete[0]?.id ?? null;

  return (
    visibleExpensesBeforeDelete[deletedIndex + 1]?.id ??
    visibleExpensesBeforeDelete[deletedIndex - 1]?.id ??
    null
  );
}

function matchesFilter(expense: ExpenseListItem, filter: ExpenseFilter): boolean {
  if (filter === "all") return true;
  if (filter === "attention") return expense.status !== "FUNDED";
  if (filter === "missing") return expense.status === "UNDERFUNDED";
  return expense.status === "OVERFUNDED";
}

function getSearchText(expense: ExpenseListItem): string {
  return normalizeQuery(
    [
      expense.title,
      expense.description,
      expense.collector.display_name,
      expense.collector.identify_tag ?? "",
    ].join(" "),
  );
}

function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase("vi-VN");
}

function isExpenseFilter(value: string | null): value is ExpenseFilter {
  return value !== null && FILTERS.has(value as ExpenseFilter);
}

function toParams(search: SearchSource): URLSearchParams {
  return new URLSearchParams(typeof search === "string" ? search : search.toString());
}

function toHref(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
