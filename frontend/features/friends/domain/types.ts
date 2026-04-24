export type FriendUser = {
  id: string;
  display_name: string;
  identify_tag: string;
};

export type FriendRequest = {
  id: string;
  sender: FriendUser;
  receiver: FriendUser;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
  created_at: string;
};

export type Friend = {
  friendship_id: string;
  user: FriendUser;
  created_at: string;
};

export type PaginatedResponse<T> = {
  results: T[];
  next: string | null;
  previous: string | null;
};

export type CountPaginatedResponse<T> = {
  results: T[];
  count: number;
};
