import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildExpenseDashboardResponse,
  buildExpenseDetailResponse,
  buildExpenseListItem,
  buildTripSettlement,
} from "@/features/trips/presentation/expenses-test-helpers";

const expensesApiMock = vi.hoisted(() => ({
  confirmSettlementTransferReceived: vi.fn(),
  createExpense: vi.fn(),
  deleteExpense: vi.fn(),
  finalizeSettlement: vi.fn(),
  getExpenseDetail: vi.fn(),
  getExpensesDashboard: vi.fn(),
  markSettlementTransferSent: vi.fn(),
  reopenSettlement: vi.fn(),
  setExpenseContribution: vi.fn(),
  updateExpense: vi.fn(),
}));

const navigationMock = vi.hoisted(() => ({
  currentSearchParams: "",
  pathname: "/trips/trip-1/expenses",
  syncReplaceSearchParams: true,
  replace: vi.fn((href: string) => {
    const query = href.split("?")[1] ?? "";
    if (navigationMock.syncReplaceSearchParams) {
      navigationMock.currentSearchParams = query;
    }
  }),
}));

function mockExpenseSearchParams(value: string) {
  navigationMock.currentSearchParams = value;
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

vi.mock("@/features/trips/infrastructure/expenses-api", () => expensesApiMock);

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
  useRouter: () => ({ replace: navigationMock.replace }),
  useSearchParams: () => new URLSearchParams(navigationMock.currentSearchParams),
}));

vi.mock("@/features/trips/presentation/trip-context", () => ({
  useTripContext: () => ({
    tripId: "trip-1",
    data: {
      members: [
        {
          membership_id: "membership-captain",
          user: { id: "user-collector", display_name: "Minh Nguyen", identify_tag: "@minh" },
          role: "CAPTAIN",
          joined_at: "2026-05-01T00:00:00Z",
        },
        {
          membership_id: "membership-member",
          user: { id: "user-member", display_name: "Linh Tran", identify_tag: "@linh" },
          role: "MEMBER",
          joined_at: "2026-05-01T00:00:00Z",
        },
      ],
    },
    refresh: vi.fn(),
  }),
}));

vi.mock("@/features/auth/application/auth-context", () => ({
  useAuth: () => ({
    user: { id: "user-payer" },
    status: "authenticated",
  }),
}));

import { ExpensesTab } from "@/features/trips/presentation/expenses-tab";

describe("ExpensesTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    for (const mock of Object.values(expensesApiMock)) {
      mock.mockReset();
    }
    navigationMock.currentSearchParams = "";
    navigationMock.syncReplaceSearchParams = true;
    navigationMock.replace.mockClear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: undefined,
    });
    expensesApiMock.getExpenseDetail.mockResolvedValue(buildExpenseDetailResponse());
  });

  it("shows loading state then renders summary metrics and expense rows", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({
        expenses: [
          buildExpenseListItem({
            id: "expense-hotel",
            title: "Hotel deposit",
            total_amount: "2000000.00",
            paid_amount: "2000000.00",
            missing_amount: "0.00",
            status: "FUNDED",
          }),
        ],
      }),
    );

    render(<ExpensesTab />);

    expect(screen.getByTestId("expenses-loading")).not.toBeNull();

    expect(await screen.findByText("Total expenses")).not.toBeNull();
    expect(screen.getAllByText("Collected").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Missing").length).toBeGreaterThan(0);
    expect(screen.getByText("My balance")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Hotel deposit/i })).not.toBeNull();
    expect(screen.getAllByText("Funded").length).toBeGreaterThan(0);
  });

  it("renders compact trip metrics and personal balance without duplicated status summary", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({
        summary: {
          total_amount: "2500000",
          paid_amount: "2600000",
          missing_amount: "0",
          surplus_amount: "100000",
        },
        my_balance: { balance: "100000", surplus_held: "100000" },
        expenses: [
          buildExpenseListItem({
            id: "expense-funded",
            status: "FUNDED",
            missing_amount: "0",
            surplus_amount: "0",
          }),
          buildExpenseListItem({
            id: "expense-over",
            status: "OVERFUNDED",
            missing_amount: "0",
            surplus_amount: "100000",
          }),
        ],
      }),
    );

    render(<ExpensesTab />);

    expect(await screen.findByText("Total expenses")).not.toBeNull();
    expect(screen.queryByText("Trip money overview")).toBeNull();
    expect(screen.queryByText("1 expense needs attention")).toBeNull();
    expect(screen.getByText("My balance")).not.toBeNull();
    expect(screen.getByText("+100.000 ₫")).not.toBeNull();
    expect(screen.getByText(/Holding/)).not.toBeNull();
    expect(screen.getByText(/group surplus/)).not.toBeNull();
  });

  it("renders financial status values for underfunded, funded, and overfunded expenses", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({
        expenses: [
          buildExpenseListItem({
            id: "expense-underfunded",
            title: "Dinner in Da Nang",
            missing_amount: "400000.00",
            surplus_amount: "0.00",
            status: "UNDERFUNDED",
          }),
          buildExpenseListItem({
            id: "expense-funded",
            title: "Hotel deposit",
            total_amount: "2000000.00",
            paid_amount: "2000000.00",
            missing_amount: "0.00",
            surplus_amount: "0.00",
            status: "FUNDED",
          }),
          buildExpenseListItem({
            id: "expense-overfunded",
            title: "Boat tickets",
            paid_amount: "1250000.00",
            missing_amount: "0.00",
            surplus_amount: "50000.00",
            status: "OVERFUNDED",
            collector: { id: "user-linh", display_name: "Linh Tran", identify_tag: "@linh" },
          }),
        ],
      }),
    );

    render(<ExpensesTab />);

    expect(await screen.findByRole("button", { name: /Dinner in Da Nang/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Hotel deposit/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Boat tickets/i })).not.toBeNull();
    expect(screen.getAllByText("Missing").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/400\.000\s*₫/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Overfunded").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/0\s*₫/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2\.000\.000\s*₫/).length).toBeGreaterThan(0);
    const overfundedRow = screen.getByRole("button", { name: /Boat tickets/i });
    expect(overfundedRow.textContent).toMatch(/1\.250\.000\s*₫/);
    expect(overfundedRow.textContent).toContain("Collected");
  });

  it("renders compact expense rows with filters and search", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({
        expenses: [
          buildExpenseListItem({
            id: "expense-funded",
            title: "Book Xe",
            description: "Phuong Trang",
            status: "FUNDED",
            missing_amount: "0",
            surplus_amount: "0",
            total_amount: "1500000",
            paid_amount: "1500000",
          }),
          buildExpenseListItem({
            id: "expense-missing",
            title: "Hotel deposit",
            status: "UNDERFUNDED",
            missing_amount: "2200000",
            surplus_amount: "0",
            collector: { id: "user-linh", display_name: "Linh Tran", identify_tag: "@linh" },
          }),
          buildExpenseListItem({
            id: "expense-over",
            title: "Tiền bia",
            status: "OVERFUNDED",
            missing_amount: "0",
            surplus_amount: "100000",
          }),
        ],
      }),
    );

    render(<ExpensesTab />);

    expect(await screen.findByRole("button", { name: /Open Book Xe/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: "All 3" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Need attention 2" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Missing 1" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Overfunded 1" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Need attention 2" }));

    await waitFor(() => {
      expect(navigationMock.replace).toHaveBeenCalledWith(
        "/trips/trip-1/expenses?expense=expense-missing&filter=attention",
        { scroll: false },
      );
    });

    fireEvent.change(screen.getByLabelText("Search expenses"), {
      target: { value: "bia" },
    });

    await waitFor(() => {
      expect(navigationMock.replace).toHaveBeenLastCalledWith(
        "/trips/trip-1/expenses?expense=expense-over&filter=attention&q=bia",
        { scroll: false },
      );
    });
  });

  it("uses URL query state for selected expense and canonicalizes invalid query values", async () => {
    mockExpenseSearchParams("expense=expense-over&filter=attention&q=bia");
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({
        expenses: [
          buildExpenseListItem({ id: "expense-funded", title: "Book Xe", status: "FUNDED", missing_amount: "0", surplus_amount: "0" }),
          buildExpenseListItem({ id: "expense-over", title: "Tiền bia", status: "OVERFUNDED", missing_amount: "0", surplus_amount: "100000" }),
        ],
      }),
    );
    expensesApiMock.getExpenseDetail.mockResolvedValueOnce(
      buildExpenseDetailResponse({ id: "expense-over", title: "Tiền bia" }),
    );

    render(<ExpensesTab />);

    await waitFor(() => {
      expect(expensesApiMock.getExpenseDetail).toHaveBeenCalledWith("trip-1", "expense-over", expect.anything());
    });
    expect(screen.queryByRole("dialog", { name: "Details for Tiền bia" })).toBeNull();
    expect(screen.getByRole("button", { name: /Open Tiền bia/i }).getAttribute("aria-pressed")).toBe("true");
    expect(navigationMock.replace).not.toHaveBeenCalledWith(expect.stringContaining("expense-funded"), expect.anything());
  });

  it("selects the nearest visible expense after deleting the current one", async () => {
    expensesApiMock.getExpensesDashboard
      .mockResolvedValueOnce(
        buildExpenseDashboardResponse({
          permissions: { can_manage_expenses: true },
          expenses: [
            buildExpenseListItem({ id: "expense-a", title: "Expense A" }),
            buildExpenseListItem({ id: "expense-b", title: "Expense B" }),
            buildExpenseListItem({ id: "expense-c", title: "Expense C" }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        buildExpenseDashboardResponse({
          permissions: { can_manage_expenses: true },
          expenses: [
            buildExpenseListItem({ id: "expense-a", title: "Expense A" }),
            buildExpenseListItem({ id: "expense-c", title: "Expense C" }),
          ],
        }),
      );
    expensesApiMock.getExpenseDetail.mockResolvedValue(
      buildExpenseDetailResponse({ id: "expense-b", title: "Expense B" }),
    );
    expensesApiMock.deleteExpense.mockResolvedValueOnce(undefined);

    render(<ExpensesTab />);

    fireEvent.click(await screen.findByRole("button", { name: /Open Expense B/i }));
    fireEvent.click(screen.getByRole("button", { name: "Delete expense" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => {
      expect(navigationMock.replace).toHaveBeenLastCalledWith(
        "/trips/trip-1/expenses?expense=expense-c",
        { scroll: false },
      );
    });
  });

  it("keeps the latest optimistic query state when an older router commit arrives late", async () => {
    navigationMock.syncReplaceSearchParams = false;
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({
        expenses: [
          buildExpenseListItem({
            id: "expense-funded",
            title: "Book Xe",
            description: "Phuong Trang",
            status: "FUNDED",
            missing_amount: "0",
            surplus_amount: "0",
          }),
          buildExpenseListItem({
            id: "expense-missing",
            title: "Hotel deposit",
            status: "UNDERFUNDED",
            missing_amount: "2200000",
            surplus_amount: "0",
          }),
          buildExpenseListItem({
            id: "expense-over",
            title: "Tiền bia",
            status: "OVERFUNDED",
            missing_amount: "0",
            surplus_amount: "100000",
          }),
        ],
      }),
    );

    const { rerender } = render(<ExpensesTab />);

    expect(await screen.findByRole("button", { name: /Open Book Xe/i })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Need attention 2" }));

    await waitFor(() => {
      expect(navigationMock.replace).toHaveBeenLastCalledWith(
        "/trips/trip-1/expenses?expense=expense-missing&filter=attention",
        { scroll: false },
      );
    });

    fireEvent.change(screen.getByLabelText("Search expenses"), {
      target: { value: "bia" },
    });

    await waitFor(() => {
      expect(navigationMock.replace).toHaveBeenLastCalledWith(
        "/trips/trip-1/expenses?expense=expense-over&filter=attention&q=bia",
        { scroll: false },
      );
    });

    mockExpenseSearchParams("expense=expense-missing&filter=attention");
    rerender(<ExpensesTab />);

    await waitFor(() => {
      expect((screen.getByLabelText("Search expenses") as HTMLInputElement).value).toBe("bia");
    });
    expect(screen.getByRole("button", { name: /Open Tiền bia/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: /Open Hotel deposit/i })).toBeNull();
  });

  it("renders an empty state when the dashboard has no expenses", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({ expenses: [] }),
    );

    render(<ExpensesTab />);

    expect(await screen.findByText("No expenses yet")).not.toBeNull();
    expect(screen.getByText("The dashboard will show totals and contribution progress after the first expense is added.")).not.toBeNull();
  });

  it("renders an error state with a retry affordance", async () => {
    expensesApiMock.getExpensesDashboard
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(buildExpenseDashboardResponse());

    render(<ExpensesTab />);

    expect(await screen.findByText("Could not load the expenses dashboard.")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(expensesApiMock.getExpensesDashboard).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByRole("button", { name: /Dinner in Da Nang/i })).not.toBeNull();
  });

  it("aborts an in-flight retry when the expenses tab unmounts", async () => {
    let resolveRetry: (value: ReturnType<typeof buildExpenseDashboardResponse>) => void = () => {};
    let retrySignal: AbortSignal | undefined;

    expensesApiMock.getExpensesDashboard
      .mockRejectedValueOnce(new Error("Network error"))
      .mockImplementationOnce((_tripId, options?: { signal?: AbortSignal }) => {
        retrySignal = options?.signal;
        return new Promise((resolve) => {
          resolveRetry = resolve;
        });
      });

    const { unmount } = render(<ExpensesTab />);

    expect(await screen.findByText("Could not load the expenses dashboard.")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(expensesApiMock.getExpensesDashboard).toHaveBeenCalledTimes(2);
    });
    expect(retrySignal).toBeInstanceOf(AbortSignal);

    unmount();

    expect(retrySignal?.aborted).toBe(true);

    await act(async () => {
      resolveRetry(buildExpenseDashboardResponse());
    });
  });

  it("opens a fixed right-side detail drawer when selecting an expense", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({
        expenses: [
          buildExpenseListItem({ id: "expense-food", title: "Dinner in Da Nang" }),
          buildExpenseListItem({
            id: "expense-van",
            title: "Airport van",
            description: "Two-way van transfer",
            total_amount: "900000.00",
            paid_amount: "300000.00",
            missing_amount: "600000.00",
            status: "UNDERFUNDED",
            collector: { id: "user-linh", display_name: "Linh Tran", identify_tag: "@linh" },
          }),
        ],
      }),
    );

    render(<ExpensesTab />);

    expect(await screen.findByRole("button", { name: /Dinner in Da Nang/i })).not.toBeNull();
    expect(screen.queryByRole("dialog", { name: "Details for Airport van" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Airport van/i }));

    const drawer = await screen.findByRole("dialog", { name: "Details for Airport van" });
    expect(drawer.className).toContain("right-0");
    expect(drawer.className).toContain("fixed");
    expect(screen.getAllByText("Two-way van transfer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Linh Tran").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Close expense details" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Details for Airport van" })).toBeNull();
    });
  });

  it("renders selected expense detail as a workbench with contextual contribution guidance", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({
        permissions: { can_manage_expenses: true },
        expenses: [
          buildExpenseListItem({
            id: "expense-food",
            title: "Dinner in Da Nang",
            status: "UNDERFUNDED",
            missing_amount: "400000",
          }),
        ],
      }),
    );
    expensesApiMock.getExpenseDetail.mockResolvedValueOnce(
      buildExpenseDetailResponse({
        id: "expense-food",
        status: "UNDERFUNDED",
        missing_amount: "400000",
        participants: [
          buildExpenseDetailResponse().participants[0],
          {
            user_id: "user-member",
            display_name: "Linh Tran",
            identify_tag: "@linh",
            share_amount: "600000",
            contributed_amount: "0",
            balance: "-600000",
          },
        ],
      }),
    );

    render(<ExpensesTab />);

    fireEvent.click(await screen.findByRole("button", { name: /Dinner in Da Nang/i }));

    await waitFor(() => {
      expect(screen.getAllByRole("heading", { name: "Details for Dinner in Da Nang" }).length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Expense details")).not.toBeNull();
    expect(screen.getByText(/Linh Tran has not contributed their share/)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Edit expense" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Delete expense" })).not.toBeNull();
  });

  it("opens create dialog, submits an expense, and reloads the dashboard", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({ permissions: { can_manage_expenses: true } }),
    ).mockResolvedValueOnce(
      buildExpenseDashboardResponse({
        permissions: { can_manage_expenses: true },
        expenses: [buildExpenseListItem({ id: "expense-created", title: "Hotel deposit" })],
      }),
    );
    expensesApiMock.createExpense.mockResolvedValueOnce({
      id: "expense-created",
      title: "Hotel deposit",
      description: "First night",
      total_amount: "1500000",
      currency_code: "VND",
      locked_at: null,
      created_at: "2026-05-01T00:00:00Z",
    });

    render(<ExpensesTab />);

    const createButtons = await screen.findAllByRole("button", { name: "Add expense" });
    fireEvent.click(createButtons[0]);
    fireEvent.change(screen.getByLabelText("Expense name"), {
      target: { value: "Hotel deposit" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "First night" },
    });
    fireEvent.change(screen.getByLabelText("Total amount"), {
      target: { value: "1.500.000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create expense" }));

    await waitFor(() => {
      expect(expensesApiMock.createExpense).toHaveBeenCalledWith("trip-1", {
        title: "Hotel deposit",
        description: "First night",
        total_amount: "1500000",
      });
    });
    await waitFor(() => {
      expect(expensesApiMock.getExpensesDashboard).toHaveBeenCalledTimes(2);
    });
  });

  it("lets captain finalize an unlocked funded settlement after confirmation", async () => {
    expensesApiMock.getExpensesDashboard
      .mockResolvedValueOnce(
        buildExpenseDashboardResponse({
          permissions: { can_manage_expenses: true },
          summary: {
            total_amount: "1200000",
            paid_amount: "1200000",
            missing_amount: "0",
            surplus_amount: "0",
          },
          expenses: [
            buildExpenseListItem({
              paid_amount: "1200000",
              missing_amount: "0",
              status: "FUNDED",
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        buildExpenseDashboardResponse({
          permissions: { can_manage_expenses: true },
          settlement: buildTripSettlement(),
        }),
      );
    expensesApiMock.finalizeSettlement.mockResolvedValueOnce(buildTripSettlement());

    render(<ExpensesTab />);

    fireEvent.click(await screen.findByRole("button", { name: "Finalize settlement" }));
    fireEvent.click(screen.getByRole("button", { name: "Finalize" }));

    await waitFor(() => {
      expect(expensesApiMock.finalizeSettlement).toHaveBeenCalledWith("trip-1");
    });
    await waitFor(() => {
      expect(expensesApiMock.getExpensesDashboard).toHaveBeenCalledTimes(2);
    });
  });

  it("lets captain reopen a finalized settlement after confirmation", async () => {
    expensesApiMock.getExpensesDashboard
      .mockResolvedValueOnce(
        buildExpenseDashboardResponse({
          permissions: { can_manage_expenses: true },
          settlement: buildTripSettlement(),
        }),
      )
      .mockResolvedValueOnce(
        buildExpenseDashboardResponse({
          permissions: { can_manage_expenses: true },
          settlement: null,
        }),
      );
    expensesApiMock.reopenSettlement.mockResolvedValueOnce(
      buildTripSettlement({ status: "REOPENED" }),
    );

    render(<ExpensesTab />);

    fireEvent.click(await screen.findByRole("button", { name: "Reopen settlement" }));
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));

    await waitFor(() => {
      expect(expensesApiMock.reopenSettlement).toHaveBeenCalledWith("trip-1");
    });
    await waitFor(() => {
      expect(expensesApiMock.getExpensesDashboard).toHaveBeenCalledTimes(2);
    });
  });

  it("normalizes comma-grouped VND create input and rejects VND decimal fractions", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValue(
      buildExpenseDashboardResponse({ permissions: { can_manage_expenses: true } }),
    );
    expensesApiMock.createExpense.mockResolvedValue({
      id: "expense-created",
      title: "Hotel deposit",
      description: "",
      total_amount: "1500000",
      currency_code: "VND",
      locked_at: null,
      created_at: "2026-05-01T00:00:00Z",
    });

    render(<ExpensesTab />);

    const emptyStateCreateButtons = await screen.findAllByRole("button", { name: "Add expense" });
    fireEvent.click(emptyStateCreateButtons[0]);
    fireEvent.change(screen.getByLabelText("Expense name"), {
      target: { value: "Hotel deposit" },
    });
    fireEvent.change(screen.getByLabelText("Total amount"), {
      target: { value: "1,500,000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create expense" }));

    await waitFor(() => {
      expect(expensesApiMock.createExpense).toHaveBeenCalledWith(
        "trip-1",
        expect.objectContaining({ total_amount: "1500000" }),
      );
    });

    fireEvent.click(await screen.findByRole("button", { name: "Add expense" }));
    fireEvent.change(screen.getByLabelText("Expense name"), {
      target: { value: "Invalid decimal" },
    });
    fireEvent.change(screen.getByLabelText("Total amount"), {
      target: { value: "1500000.50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create expense" }));

    expect(await screen.findByText("Enter a valid total amount.")).not.toBeNull();
    expect(expensesApiMock.createExpense).toHaveBeenCalledTimes(1);
  });

  it("uses an empty dashboard trip currency when creating the first USD expense", async () => {
    const emptyUsdDashboard = {
      ...buildExpenseDashboardResponse({
        permissions: { can_manage_expenses: true },
        expenses: [],
        summary: {
          total_amount: "0",
          paid_amount: "0",
          missing_amount: "0",
          surplus_amount: "0",
        },
        my_balance: { balance: "0" },
      }),
      currency_code: "USD",
    };
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(emptyUsdDashboard).mockResolvedValueOnce(
      buildExpenseDashboardResponse({
        currency_code: "USD",
        permissions: { can_manage_expenses: true },
        expenses: [
          buildExpenseListItem({
            id: "expense-created",
            title: "Coffee",
            total_amount: "10.50",
            currency_code: "USD",
          }),
        ],
      }),
    );
    expensesApiMock.createExpense.mockResolvedValueOnce({
      id: "expense-created",
      title: "Coffee",
      description: "",
      total_amount: "10.50",
      currency_code: "USD",
      locked_at: null,
      created_at: "2026-05-01T00:00:00Z",
    });

    render(<ExpensesTab />);

    const emptyUsdCreateButtons = await screen.findAllByRole("button", { name: "Add expense" });
    fireEvent.click(emptyUsdCreateButtons[0]);
    expect(screen.getAllByText("USD").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Expense name"), {
      target: { value: "Coffee" },
    });
    fireEvent.change(screen.getByLabelText("Total amount"), {
      target: { value: "10.50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create expense" }));

    await waitFor(() => {
      expect(expensesApiMock.createExpense).toHaveBeenCalledWith("trip-1", {
        title: "Coffee",
        description: "",
        total_amount: "10.50",
      });
    });
    expect(screen.queryByText("Enter a valid total amount.")).toBeNull();
  });

  it("hides expense management controls for member and finalized settlement", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({ permissions: { can_manage_expenses: false } }),
    );

    const { unmount } = render(<ExpensesTab />);

    expect(await screen.findByText("View mode")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Add expense" })).toBeNull();

    unmount();
    vi.resetAllMocks();
    expensesApiMock.getExpenseDetail.mockResolvedValue(buildExpenseDetailResponse({ locked: true }));
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({
        permissions: { can_manage_expenses: true },
        settlement: buildTripSettlement(),
      }),
    );

    render(<ExpensesTab />);

    expect(await screen.findByText("Settlement finalized. Expenses are locked.")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Dinner in Da Nang/i }));
    expect(screen.getByText("Settlement is finalized. Reopen it before editing expenses or contributions.")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Add expense" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit expense" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete expense" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit contribution/ })).toBeNull();
  });

  it("lets captain edit participant contribution and reloads detail and dashboard", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValue(
      buildExpenseDashboardResponse({ permissions: { can_manage_expenses: true } }),
    );
    expensesApiMock.getExpenseDetail
      .mockResolvedValueOnce(
        buildExpenseDetailResponse({
          id: "expense-food",
          participants: [
            buildExpenseDetailResponse().participants[0],
            buildExpenseDetailResponse().participants[1],
          ],
        }),
      )
      .mockResolvedValueOnce(
        buildExpenseDetailResponse({
          id: "expense-food",
          participants: [
            buildExpenseDetailResponse().participants[0],
            buildExpenseDetailResponse().participants[1],
          ],
        }),
      );
    expensesApiMock.setExpenseContribution.mockResolvedValueOnce({
      id: "contribution-1",
      user: { id: "user-member", display_name: "Linh Tran", identify_tag: "@linh" },
      amount: "450000",
      updated_at: "2026-05-01T00:00:00Z",
    });

    render(<ExpensesTab />);

    fireEvent.click(await screen.findByRole("button", { name: /Dinner in Da Nang/i }));
    expect(await screen.findByText("Linh Tran")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit contribution for Linh Tran" }));
    fireEvent.change(screen.getByLabelText("Amount Linh Tran contributed"), {
      target: { value: "1.500.000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save contribution for Linh Tran" }));

    await waitFor(() => {
      expect(expensesApiMock.setExpenseContribution).toHaveBeenCalledWith(
        "trip-1",
        "expense-food",
        "user-member",
        { amount: "1500000" },
      );
    });
    await waitFor(() => {
      expect(expensesApiMock.getExpenseDetail).toHaveBeenCalledTimes(2);
    });
  });

  it("does not reload stale contribution detail after selecting another expense", async () => {
    const contributionSave = createDeferred<{
      id: string;
      user: { id: string; display_name: string; identify_tag: string };
      amount: string;
      updated_at: string;
    }>();
    const detailA = buildExpenseDetailResponse({
      id: "expense-food",
      title: "Dinner in Da Nang",
      participants: [
        buildExpenseDetailResponse().participants[0],
        buildExpenseDetailResponse().participants[1],
      ],
    });
    const detailB = buildExpenseDetailResponse({
      id: "expense-van",
      title: "Airport van",
      participants: [
        {
          user_id: "user-b",
          display_name: "B Participant",
          identify_tag: "@b",
          share_amount: "100000",
          contributed_amount: "100000",
          balance: "0",
        },
      ],
    });

    expensesApiMock.getExpensesDashboard.mockResolvedValue(
      buildExpenseDashboardResponse({
        permissions: { can_manage_expenses: true },
        expenses: [
          buildExpenseListItem({ id: "expense-food", title: "Dinner in Da Nang" }),
          buildExpenseListItem({ id: "expense-van", title: "Airport van" }),
        ],
      }),
    );
    expensesApiMock.getExpenseDetail.mockImplementation((_tripId, expenseId) => {
      if (expenseId === "expense-van") return Promise.resolve(detailB);
      return Promise.resolve(detailA);
    });
    expensesApiMock.setExpenseContribution.mockReturnValueOnce(contributionSave.promise);

    render(<ExpensesTab />);

    fireEvent.click(await screen.findByRole("button", { name: /Dinner in Da Nang/i }));
    expect(await screen.findByText("Linh Tran")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit contribution for Linh Tran" }));
    fireEvent.change(screen.getByLabelText("Amount Linh Tran contributed"), {
      target: { value: "1.500.000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save contribution for Linh Tran" }));

    await waitFor(() => {
      expect(expensesApiMock.setExpenseContribution).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: /Open Airport van/i }));

    expect(await screen.findByText("B Participant")).not.toBeNull();

    await act(async () => {
      contributionSave.resolve({
        id: "contribution-1",
        user: { id: "user-member", display_name: "Linh Tran", identify_tag: "@linh" },
        amount: "1500000",
        updated_at: "2026-05-01T00:00:00Z",
      });
      await contributionSave.promise;
    });

    await waitFor(() => {
      expect(expensesApiMock.getExpensesDashboard).toHaveBeenCalledTimes(2);
    });

    expect(
      expensesApiMock.getExpenseDetail.mock.calls.filter((call) => call[1] === "expense-food"),
    ).toHaveLength(1);
    expect(screen.getByText("B Participant")).not.toBeNull();
  });

  it("keeps the detail drawer fixed across viewport changes and closes from the drawer control", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({
        expenses: [
          buildExpenseListItem({ id: "expense-food", title: "Dinner in Da Nang" }),
          buildExpenseListItem({ id: "expense-van", title: "Airport van" }),
        ],
      }),
    );
    expensesApiMock.getExpenseDetail.mockResolvedValue(
      buildExpenseDetailResponse({ id: "expense-van", title: "Airport van" }),
    );

    render(<ExpensesTab />);

    fireEvent.click(await screen.findByRole("button", { name: /Open Airport van/i }));

    const drawer = await screen.findByRole("dialog", { name: "Details for Airport van" });
    expect(drawer.className).toContain("fixed");
    expect(drawer.className).toContain("right-0");
    expect(drawer.className).toContain("top-0");

    fireEvent.click(screen.getByRole("button", { name: "Close expense details" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Details for Airport van" })).toBeNull();
    });
  });

  it("lets captain edit an unlocked expense from the detail panel", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({ permissions: { can_manage_expenses: true } }),
    ).mockResolvedValueOnce(
      buildExpenseDashboardResponse({
        permissions: { can_manage_expenses: true },
        expenses: [
          buildExpenseListItem({
            id: "expense-food",
            title: "Updated dinner",
            total_amount: "1500000",
          }),
        ],
      }),
    );
    expensesApiMock.getExpenseDetail.mockResolvedValue(
      buildExpenseDetailResponse({ id: "expense-food" }),
    );
    expensesApiMock.updateExpense.mockResolvedValueOnce(
      buildExpenseDetailResponse({
        id: "expense-food",
        title: "Updated dinner",
        total_amount: "1500000",
      }),
    );

    render(<ExpensesTab />);

    fireEvent.click(await screen.findByRole("button", { name: /Dinner in Da Nang/i }));
    expect(await screen.findByText("Linh Tran")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit expense" }));
    fireEvent.change(screen.getByLabelText("Expense name"), {
      target: { value: "Updated dinner" },
    });
    fireEvent.change(screen.getByLabelText("Total amount"), {
      target: { value: "1.500.000" },
    });
    fireEvent.change(screen.getByLabelText("Collector"), {
      target: { value: "user-member" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save expense" }));

    await waitFor(() => {
      expect(expensesApiMock.updateExpense).toHaveBeenCalledWith("trip-1", "expense-food", {
        title: "Updated dinner",
        description: "Seafood dinner for the group",
        total_amount: "1500000",
        collector_id: "user-member",
      });
    });
    await waitFor(() => {
      expect(expensesApiMock.getExpensesDashboard).toHaveBeenCalledTimes(2);
    });
  });

  it("lets captain delete an unlocked expense after confirmation", async () => {
    expensesApiMock.getExpensesDashboard
      .mockResolvedValueOnce(
        buildExpenseDashboardResponse({ permissions: { can_manage_expenses: true } }),
      )
      .mockResolvedValueOnce(
        buildExpenseDashboardResponse({
          permissions: { can_manage_expenses: true },
          expenses: [],
        }),
      );
    expensesApiMock.getExpenseDetail.mockResolvedValue(
      buildExpenseDetailResponse({ id: "expense-food" }),
    );
    expensesApiMock.deleteExpense.mockResolvedValueOnce(undefined);

    render(<ExpensesTab />);

    fireEvent.click(await screen.findByRole("button", { name: /Dinner in Da Nang/i }));
    expect(await screen.findByText("Linh Tran")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete expense" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => {
      expect(expensesApiMock.deleteExpense).toHaveBeenCalledWith("trip-1", "expense-food");
    });
    await waitFor(() => {
      expect(expensesApiMock.getExpensesDashboard).toHaveBeenCalledTimes(2);
    });
  });

  it("normalizes comma-grouped contribution input and rejects VND decimal fractions", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValue(
      buildExpenseDashboardResponse({ permissions: { can_manage_expenses: true } }),
    );
    expensesApiMock.getExpenseDetail.mockResolvedValue(buildExpenseDetailResponse({ id: "expense-food" }));
    expensesApiMock.setExpenseContribution.mockResolvedValue({
      id: "contribution-1",
      user: { id: "user-member", display_name: "Linh Tran", identify_tag: "@linh" },
      amount: "1500000",
      updated_at: "2026-05-01T00:00:00Z",
    });

    render(<ExpensesTab />);

    fireEvent.click(await screen.findByRole("button", { name: /Dinner in Da Nang/i }));
    expect(await screen.findByText("Linh Tran")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit contribution for Linh Tran" }));
    fireEvent.change(screen.getByLabelText("Amount Linh Tran contributed"), {
      target: { value: "1,500,000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save contribution for Linh Tran" }));

    await waitFor(() => {
      expect(expensesApiMock.setExpenseContribution).toHaveBeenCalledWith(
        "trip-1",
        "expense-food",
        "user-member",
        { amount: "1500000" },
      );
    });

    fireEvent.click(await screen.findByRole("button", { name: "Edit contribution for Linh Tran" }));
    fireEvent.change(screen.getByLabelText("Amount Linh Tran contributed"), {
      target: { value: "1500000.50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save contribution for Linh Tran" }));

    expect(await screen.findByText("Enter a valid contribution amount.")).not.toBeNull();
    expect(expensesApiMock.setExpenseContribution).toHaveBeenCalledTimes(1);
  });

  it("does not render stale detail participants under another selected expense", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({
        permissions: { can_manage_expenses: true },
        expenses: [
          buildExpenseListItem({ id: "expense-food", title: "Dinner in Da Nang" }),
          buildExpenseListItem({ id: "expense-van", title: "Airport van" }),
        ],
      }),
    );
    expensesApiMock.getExpenseDetail
      .mockResolvedValueOnce(
        buildExpenseDetailResponse({
          id: "expense-food",
          participants: [
            {
              user_id: "user-stale",
              display_name: "Stale Participant",
              identify_tag: "@stale",
              share_amount: "100000",
              contributed_amount: "0",
              balance: "-100000",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        buildExpenseDetailResponse({
          id: "expense-food",
          participants: [
            {
              user_id: "user-stale",
              display_name: "Stale Participant",
              identify_tag: "@stale",
              share_amount: "100000",
              contributed_amount: "0",
              balance: "-100000",
            },
          ],
        }),
      );

    render(<ExpensesTab />);

    fireEvent.click(await screen.findByRole("button", { name: /Dinner in Da Nang/i }));
    expect(await screen.findByText("Stale Participant")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Airport van/i }));

    await waitFor(() => {
      expect(screen.getAllByRole("heading", { name: "Details for Airport van" }).length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(screen.queryByText("Stale Participant")).toBeNull();
    });
    expect(screen.queryByRole("button", { name: /Edit contribution for Stale Participant/i })).toBeNull();
  });

  it("uses expense detail permissions for contribution editing", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({ permissions: { can_manage_expenses: true } }),
    );
    expensesApiMock.getExpenseDetail.mockResolvedValueOnce(
      buildExpenseDetailResponse({
        id: "expense-food",
        permissions: { can_manage_expenses: false },
      }),
    );

    render(<ExpensesTab />);

    fireEvent.click(await screen.findByRole("button", { name: /Dinner in Da Nang/i }));
    expect(await screen.findByText("Linh Tran")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Edit contribution/i })).toBeNull();
    expect(screen.queryByLabelText("Amount Linh Tran contributed")).toBeNull();
  });

  it("shows contribution rows as read-only for non-captain", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({ permissions: { can_manage_expenses: false } }),
    );
    expensesApiMock.getExpenseDetail.mockResolvedValueOnce(
      buildExpenseDetailResponse({ permissions: { can_manage_expenses: false } }),
    );

    render(<ExpensesTab />);

    fireEvent.click(await screen.findByRole("button", { name: /Dinner in Da Nang/i }));
    expect(await screen.findByText("Linh Tran")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Edit contribution/i })).toBeNull();
    expect(screen.queryByLabelText("Amount Linh Tran contributed")).toBeNull();
  });

  it("renders the active settlement transfer checklist when present", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({ settlement: buildTripSettlement() }),
    );

    render(<ExpensesTab />);

    expect(await screen.findByText("Transfer list")).not.toBeNull();
    expect(screen.getByText("Payer User")).not.toBeNull();
    expect(screen.getByText("Recipient User")).not.toBeNull();
    expect(screen.getByRole("button", { name: "I sent it" })).not.toBeNull();
  });
});
