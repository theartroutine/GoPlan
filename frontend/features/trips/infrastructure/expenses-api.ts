import type {
  ContributionResponse,
  CreateExpensePayload,
  ExpenseDashboardResponse,
  ExpenseResponse,
  SetContributionPayload,
  SettlementTransfer,
  TripSettlement,
} from "@/features/trips/domain/expenses-types";
import { bff } from "@/shared/http/bff-client";

type RequestOptions = {
  signal?: AbortSignal;
};

export async function getExpensesDashboard(
  tripId: string,
  options?: RequestOptions,
): Promise<ExpenseDashboardResponse> {
  const res = await bff.get<ExpenseDashboardResponse>(
    `/api/trips/${tripId}/expenses`,
    options?.signal ? { signal: options.signal } : undefined,
  );
  return res.data;
}

export async function createExpense(
  tripId: string,
  payload: CreateExpensePayload,
): Promise<ExpenseResponse> {
  const res = await bff.post<ExpenseResponse>(`/api/trips/${tripId}/expenses`, payload);
  return res.data;
}

export async function setExpenseContribution(
  tripId: string,
  expenseId: string,
  userId: string,
  payload: SetContributionPayload,
): Promise<ContributionResponse> {
  const res = await bff.patch<ContributionResponse>(
    `/api/trips/${tripId}/expenses/${expenseId}/contributions/${userId}`,
    payload,
  );
  return res.data;
}

export async function finalizeSettlement(tripId: string): Promise<TripSettlement> {
  const res = await bff.post<TripSettlement>(`/api/trips/${tripId}/settlement/finalize`);
  return res.data;
}

export async function reopenSettlement(tripId: string): Promise<TripSettlement> {
  const res = await bff.post<TripSettlement>(`/api/trips/${tripId}/settlement/reopen`);
  return res.data;
}

export async function markSettlementTransferSent(
  tripId: string,
  transferId: string,
): Promise<SettlementTransfer> {
  const res = await bff.post<SettlementTransfer>(
    `/api/trips/${tripId}/settlement/transfers/${transferId}/sent`,
  );
  return res.data;
}

export async function confirmSettlementTransferReceived(
  tripId: string,
  transferId: string,
): Promise<SettlementTransfer> {
  const res = await bff.post<SettlementTransfer>(
    `/api/trips/${tripId}/settlement/transfers/${transferId}/received`,
  );
  return res.data;
}
