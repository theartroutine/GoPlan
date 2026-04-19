export type TripStatus = "PLANNING" | "ONGOING" | "COMPLETED" | "CANCELLED";
export type TripRole = "CAPTAIN" | "MEMBER";

export type TripListItem = {
  id: string;
  name: string;
  destination: string;
  cover_image_url: string;
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
  destination_place_id?: string;
  destination_lat?: number | null;
  destination_lng?: number | null;
  destination_country_code?: string;
  cover_image_url?: string;
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
    destination_place_id: string;
    destination_lat: string | null;
    destination_lng: string | null;
    destination_country_code: string;
    cover_image_url: string;
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

export type TripMemberItem = {
  membership_id: string;
  user: {
    id: string;
    display_name: string;
    identify_tag: string | null;
  };
  role: TripRole;
  joined_at: string;
};

export type TripDetail = {
  id: string;
  name: string;
  destination: string;
  destination_place_id: string;
  destination_lat: string | null;
  destination_lng: string | null;
  destination_country_code: string;
  cover_image_url: string;
  start_date: string;
  end_date: string;
  description: string;
  status: TripStatus;
  currency_code: string;
  budget_estimate: string | null;
  cancelled_at: string | null;
  created_at: string;
};

export type TripDetailResponse = {
  trip: TripDetail;
  my_membership: { role: TripRole; status: string; joined_at: string };
  members: TripMemberItem[];
};

export type UpdateTripPayload = Partial<{
  name: string;
  destination: string;
  destination_place_id: string;
  destination_lat: number | null;
  destination_lng: number | null;
  destination_country_code: string;
  cover_image_url: string;
  start_date: string;
  end_date: string;
  description: string;
  currency_code: string;
  budget_estimate: string | null;
}>;

export type TripInvitation = {
  id: string;
  invitee: { id: string; display_name: string; identify_tag: string | null };
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
  created_at: string;
};

export type InvitableFriend = {
  id: string;
  display_name: string;
  identify_tag: string | null;
};
