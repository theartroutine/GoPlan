import type { CursorPage } from '@/shared/api/pagination';

export type FriendRequestStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';

export interface FriendUser {
  id: string;
  display_name: string;
  identify_tag: string;
  avatar_url: string | null;
}

export interface Friend {
  friendship_id: string;
  user: FriendUser;
  created_at: string;
}

export interface FriendRequest {
  id: string;
  sender: FriendUser;
  receiver: FriendUser;
  status: FriendRequestStatus;
  resolved_at: string | null;
  created_at: string;
}

export type FriendsPage = CursorPage<Friend>;
export type FriendRequestsPage = CursorPage<FriendRequest>;

export interface AcceptFriendRequestResult {
  friendship: Friend;
  friendRequestId: string;
}
