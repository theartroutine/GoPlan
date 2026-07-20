export type TripStatus = 'PLANNING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
export type TripRole = 'CAPTAIN' | 'MEMBER';
export type MemberStatus = 'ACTIVE' | 'LEFT' | 'REMOVED';

export interface TripListItem {
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
  my_role: TripRole | null;
}

export interface Trip {
  id: string;
  name: string;
  destination: string;
  destination_provider: string;
  destination_provider_id: string;
  destination_lat: string | null;
  destination_lng: string | null;
  destination_country_code: string;
  cover_image_url: string;
  start_date: string;
  end_date: string;
  description: string;
  status: TripStatus;
  currency_code: string;
  timezone: string;
  budget_estimate: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface TripMemberUser {
  id: string;
  display_name: string;
  identify_tag: string;
  avatar_url: string | null;
}

export interface TripMember {
  membership_id: string;
  user: TripMemberUser;
  role: TripRole;
  joined_at: string;
}

export interface MyMembership {
  role: TripRole;
  status: MemberStatus;
  joined_at: string;
}

export interface TripDetailResponse {
  trip: Trip;
  my_membership: MyMembership;
  members: TripMember[];
}

export interface TripListPage {
  items: TripListItem[];
  nextCursor: string | null;
}

export interface CreateTripInput {
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  description?: string;
  currency_code?: string;
  budget_estimate?: string;
}
