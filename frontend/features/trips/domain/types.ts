export type TripStatus = "PLANNING" | "ONGOING" | "COMPLETED" | "CANCELLED";
export type TripRole = "CAPTAIN" | "MEMBER";

export type TripListItem = {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  status: TripStatus;
  currency_code: string;
  budget_estimate: string | null;
  member_count: number;
  my_role: TripRole;
};

export type TripListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: TripListItem[];
};

export type CreateTripPayload = {
  name: string;
  destination: string;
  start_date: string;   // "YYYY-MM-DD"
  end_date: string;     // "YYYY-MM-DD"
  description?: string;
  currency_code?: string;
  budget_estimate?: string | null;
};

export type CreateTripResponse = {
  trip: {
    id: string;
    name: string;
    destination: string;
    start_date: string;
    end_date: string;
    description: string;
    status: TripStatus;
    currency_code: string;
    budget_estimate: string | null;
    cancelled_at: string | null;
    created_at: string;
  };
};
