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
  finalizeSettlement: vi.fn(),
  getExpenseDetail: vi.fn(),
  getExpensesDashboard: vi.fn(),
  markSettlementTransferSent: vi.fn(),
  reopenSettlement: vi.fn(),
  setExpenseContribution: vi.fn(),
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
    expensesApiMock.getExpenseDetail.mockResolvedValue(buildExpenseDetailResponse());
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

  it("renders exact financial status copy for underfunded, funded, and overfunded expenses", async () => {
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

    expect(await screen.findByText("Still missing 400,000 VND.")).not.toBeNull();
    expect(screen.getByText("Funded exactly.")).not.toBeNull();
    expect(screen.getByText("Surplus 50,000 VND is held by Linh Tran.")).not.toBeNull();
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

    const createButtons = await screen.findAllByRole("button", { name: "Thêm khoản chi" });
    fireEvent.click(createButtons[0]);
    fireEvent.change(screen.getByLabelText("Tên khoản chi"), {
      target: { value: "Hotel deposit" },
    });
    fireEvent.change(screen.getByLabelText("Mô tả"), {
      target: { value: "First night" },
    });
    fireEvent.change(screen.getByLabelText("Tổng tiền"), {
      target: { value: "1.500.000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tạo khoản chi" }));

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

    const emptyStateCreateButtons = await screen.findAllByRole("button", { name: "Thêm khoản chi" });
    fireEvent.click(emptyStateCreateButtons[0]);
    fireEvent.change(screen.getByLabelText("Tên khoản chi"), {
      target: { value: "Hotel deposit" },
    });
    fireEvent.change(screen.getByLabelText("Tổng tiền"), {
      target: { value: "1,500,000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tạo khoản chi" }));

    await waitFor(() => {
      expect(expensesApiMock.createExpense).toHaveBeenCalledWith(
        "trip-1",
        expect.objectContaining({ total_amount: "1500000" }),
      );
    });

    fireEvent.click(await screen.findByRole("button", { name: "Thêm khoản chi" }));
    fireEvent.change(screen.getByLabelText("Tên khoản chi"), {
      target: { value: "Invalid decimal" },
    });
    fireEvent.change(screen.getByLabelText("Tổng tiền"), {
      target: { value: "1500000.50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tạo khoản chi" }));

    expect(await screen.findByText("Nhập tổng tiền hợp lệ.")).not.toBeNull();
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

    const emptyUsdCreateButtons = await screen.findAllByRole("button", { name: "Thêm khoản chi" });
    fireEvent.click(emptyUsdCreateButtons[0]);
    expect(screen.getAllByText("USD").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Tên khoản chi"), {
      target: { value: "Coffee" },
    });
    fireEvent.change(screen.getByLabelText("Tổng tiền"), {
      target: { value: "10.50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tạo khoản chi" }));

    await waitFor(() => {
      expect(expensesApiMock.createExpense).toHaveBeenCalledWith("trip-1", {
        title: "Coffee",
        description: "",
        total_amount: "10.50",
      });
    });
    expect(screen.queryByText("Nhập tổng tiền hợp lệ.")).toBeNull();
  });

  it("hides expense management controls for member and finalized settlement", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({ permissions: { can_manage_expenses: false } }),
    );

    const { unmount } = render(<ExpensesTab />);

    expect(await screen.findByText("Chế độ xem")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Thêm khoản chi" })).toBeNull();

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

    expect(
      await screen.findAllByText("Locked by finalized settlement. Reopen settlement to edit."),
    ).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Thêm khoản chi" })).toBeNull();
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

    expect(await screen.findByText("Linh Tran")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sửa đóng góp của Linh Tran" }));
    fireEvent.change(screen.getByLabelText("Số tiền Linh Tran đã đóng"), {
      target: { value: "1.500.000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu đóng góp của Linh Tran" }));

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

    expect(await screen.findByText("Linh Tran")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sửa đóng góp của Linh Tran" }));
    fireEvent.change(screen.getByLabelText("Số tiền Linh Tran đã đóng"), {
      target: { value: "1,500,000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu đóng góp của Linh Tran" }));

    await waitFor(() => {
      expect(expensesApiMock.setExpenseContribution).toHaveBeenCalledWith(
        "trip-1",
        "expense-food",
        "user-member",
        { amount: "1500000" },
      );
    });

    fireEvent.click(await screen.findByRole("button", { name: "Sửa đóng góp của Linh Tran" }));
    fireEvent.change(screen.getByLabelText("Số tiền Linh Tran đã đóng"), {
      target: { value: "1500000.50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu đóng góp của Linh Tran" }));

    expect(await screen.findByText("Nhập số tiền đóng góp hợp lệ.")).not.toBeNull();
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

    expect(await screen.findByText("Stale Participant")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Airport van/i }));

    await waitFor(() => {
      expect(screen.getAllByRole("heading", { name: "Airport van" }).length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(screen.queryByText("Stale Participant")).toBeNull();
    });
    expect(screen.queryByRole("button", { name: /Sửa đóng góp của Stale Participant/i })).toBeNull();
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

    expect(await screen.findByText("Linh Tran")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Sửa đóng góp/i })).toBeNull();
    expect(screen.queryByLabelText("Số tiền Linh Tran đã đóng")).toBeNull();
  });

  it("shows contribution rows as read-only for non-captain", async () => {
    expensesApiMock.getExpensesDashboard.mockResolvedValueOnce(
      buildExpenseDashboardResponse({ permissions: { can_manage_expenses: false } }),
    );
    expensesApiMock.getExpenseDetail.mockResolvedValueOnce(
      buildExpenseDetailResponse({ permissions: { can_manage_expenses: false } }),
    );

    render(<ExpensesTab />);

    expect(await screen.findByText("Linh Tran")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Sửa đóng góp/i })).toBeNull();
    expect(screen.queryByLabelText("Số tiền Linh Tran đã đóng")).toBeNull();
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
