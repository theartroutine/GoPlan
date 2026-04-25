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
  next: string | null;
  previous: string | null;
  results: TripListItem[];
};

export type CreateTripPayload = {
  name: string;
  destination: string;
  destination_provider?: string;
  destination_provider_id?: string;
  destination_lat?: number | null;
  destination_lng?: number | null;
  destination_country_code?: string;
  cover_image_url?: string;
  start_date: string;   // "YYYY-MM-DD"
  end_date: string;     // "YYYY-MM-DD"
  description?: string;
  currency_code?: string;
  timezone?: string;
  budget_estimate?: string | null;
};

export type CreateTripResponse = {
  trip: {
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
};

export type TripDetailResponse = {
  trip: TripDetail;
  my_membership: { role: TripRole; status: string; joined_at: string };
  members: TripMemberItem[];
};

export type UpdateTripPayload = Partial<{
  name: string;
  destination: string;
  destination_provider: string;
  destination_provider_id: string;
  destination_lat: number | null;
  destination_lng: number | null;
  destination_country_code: string;
  cover_image_url: string;
  start_date: string;
  end_date: string;
  description: string;
  currency_code: string;
  timezone: string;
  budget_estimate: string | null;
}>;

// -------- Timeline (Phase 1: read-only) --------

export type TimelineSectionKind = "SYSTEM_DAY" | "SPECIAL_DAY";
export type TimelineActivityTimeMode = "ALL_DAY" | "AT_TIME" | "TIME_RANGE";
export type TimelineActivityStatus = "UPCOMING" | "IN_PROGRESS" | "DONE" | "CANCELLED";
export type TimelineLocationMode = "MANUAL" | "STRUCTURED";

export type TimelineSystemTypeMeta = {
  code: string;
  label: string;
  color_token: string;
  icon_key: string;
};

export type TimelineCustomTypeMeta = {
  id: string;
  name: string;
  normalized_name: string;
  color_token: string;
  icon_key: string;
  is_active: boolean;
};

export type TimelineActivityType =
  | { kind: "SYSTEM"; code: string; label: string; color_token: string; icon_key: string }
  | { kind: "CUSTOM"; id: string; label: string; color_token: string; icon_key: string };

export type TimelineAssignee = {
  id: string;
  display_name: string;
  identify_tag: string | null;
};

export type TimelinePlace = {
  provider: string;
  provider_id: string;
  title: string;
  address: string;
  lat: number | null;
  lng: number | null;
};

export type TimelineLocation = {
  location_mode: TimelineLocationMode;
  location_label: string;
  location_note: string;
  place: TimelinePlace | null;
};

export type TimelineActivity = {
  id: string;
  title: string;
  time_mode: TimelineActivityTimeMode;
  start_time: string | null;
  end_time: string | null;
  status: TimelineActivityStatus;
  position: number;
  activity_type: TimelineActivityType | null;
  assignee: TimelineAssignee | null;
  location: TimelineLocation;
  note: string;
  meeting_point: string;
  contact_name: string;
  contact_phone: string;
  booking_reference: string;
  external_link: string;
  reminder_offsets_minutes: number[];
};

export type TimelineSection = {
  id: string;
  kind: TimelineSectionKind;
  section_date: string;
  label: string;
  is_label_custom: boolean;
  position: number;
  activities: TimelineActivity[];
};

export type TimelinePermissions = {
  can_edit_timeline: boolean;
  can_manage_custom_types: boolean;
  can_create_sections: boolean;
};

export type TimelineResponse = {
  trip_timezone: string;
  permissions: TimelinePermissions;
  system_types: TimelineSystemTypeMeta[];
  custom_types: TimelineCustomTypeMeta[];
  sections: TimelineSection[];
};

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
