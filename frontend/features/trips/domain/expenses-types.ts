export type ExpenseStatus = "UNDERFUNDED" | "FUNDED" | "OVERFUNDED";

export type ExpenseMoneySummary = {
  total_amount: string;
  paid_amount: string;
  missing_amount: string;
  surplus_amount: string;
};

export type ExpensePerson = {
  id: string;
  display_name: string;
  identify_tag: string | null;
};

export type ExpenseListItem = ExpenseMoneySummary & {
  id: string;
  title: string;
  description: string;
  currency_code: string;
  status: ExpenseStatus;
  collector: ExpensePerson;
  locked: boolean;
};

export type ExpenseParticipantContribution = {
  user_id: string;
  display_name: string;
  identify_tag: string | null;
  share_amount: string;
  contributed_amount: string;
  balance: string;
};

export type ExpenseDetailResponse = ExpenseListItem & {
  locked_at: string | null;
  created_at: string;
  permissions: { can_manage_expenses: boolean };
  participants: ExpenseParticipantContribution[];
};

export type SettlementTransfer = {
  id: string;
  payer: ExpensePerson;
  recipient: ExpensePerson;
  amount: string;
  payer_marked_sent_at: string | null;
  recipient_confirmed_at: string | null;
};

export type TripSettlement = {
  id: string;
  status: "FINALIZED" | "REOPENED";
  finalized_at: string | null;
  transfers: SettlementTransfer[];
};

export type ExpenseDashboardResponse = {
  summary: ExpenseMoneySummary;
  permissions: { can_manage_expenses: boolean };
  my_balance: { balance: string };
  member_balances: Record<string, { balance: string }>;
  expenses: ExpenseListItem[];
  settlement: TripSettlement | null;
};

export type CreateExpensePayload = {
  title: string;
  description?: string;
  total_amount: string;
  collector_id?: string;
};

export type SetContributionPayload = {
  amount: string;
};

export type ExpenseResponse = {
  id: string;
  title: string;
  description: string;
  total_amount: string;
  currency_code: string;
  locked_at: string | null;
  created_at: string;
};

export type ContributionResponse = {
  id: string;
  user: ExpensePerson;
  amount: string;
  updated_at: string;
};
