import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildExpenseDashboardResponse,
  buildExpenseListItem,
  buildTripSettlement,
} from "@/features/trips/presentation/expenses-test-helpers";

const expensesApiMock = vi.hoisted(() => ({
  getExpensesDashboard: vi.fn(),
}));

vi.mock("@/features/trips/infrastructure/expenses-api", () => expensesApiMock);

vi.mock("@/features/trips/presentation/trip-context", () => ({
  useTripContext: () => ({ tripId: "trip-1" }),
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
    vi.resetAllMocks();
  });

  it("shows loading state then renders summary metrics and expense cards", async () => {
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

    expect(await screen.findByText("Tổng chi phí")).not.toBeNull();
    expect(screen.getAllByText("Đã thu").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Còn thiếu").length).toBeGreaterThan(0);
    expect(screen.getByText("Số dư của tôi")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Hotel deposit/i })).not.toBeNull();
    expect(screen.getAllByText("Đã đủ tiền").length).toBeGreaterThan(0);
  });

  it("renders an empty state when the dashboard has no expenses", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({ expenses: [] }),
    );

    render(<ExpensesTab />);

    expect(await screen.findByText("Chưa có khoản chi nào")).not.toBeNull();
    expect(screen.getByText("Dashboard sẽ hiển thị tổng tiền và tiến độ đóng góp khi có khoản chi đầu tiên.")).not.toBeNull();
  });

  it("renders an error state with a retry affordance", async () => {
    expensesApiMock.getExpensesDashboard
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(buildExpenseDashboardResponse());

    render(<ExpensesTab />);

    expect(await screen.findByText("Không tải được dashboard chi phí.")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

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

    expect(await screen.findByText("Không tải được dashboard chi phí.")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

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

  it("updates the detail panel when selecting another expense", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: /Airport van/i }));

    await waitFor(() => {
      expect(screen.getAllByRole("heading", { name: "Airport van" }).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("Two-way van transfer").length).toBeGreaterThan(0);
    expect(screen.getByText("Linh Tran")).not.toBeNull();
  });

  it("shows captain management placeholder and member read-only state", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({ permissions: { can_manage_expenses: true } }),
    );

    const { unmount } = render(<ExpensesTab />);

    expect((await screen.findByRole("button", { name: "Thêm khoản chi" })).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Sẽ mở ở task sau")).not.toBeNull();

    unmount();
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({ permissions: { can_manage_expenses: false } }),
    );

    render(<ExpensesTab />);

    expect(await screen.findByText("Chế độ xem")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Thêm khoản chi" })).toBeNull();
  });

  it("renders the active settlement transfer checklist when present", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({ settlement: buildTripSettlement() }),
    );

    render(<ExpensesTab />);

    expect(await screen.findByText("Settlement checklist")).not.toBeNull();
    expect(screen.getByText("Payer User")).not.toBeNull();
    expect(screen.getByText("Recipient User")).not.toBeNull();
    expect(screen.getByRole("button", { name: "I've sent" })).not.toBeNull();
  });
});
