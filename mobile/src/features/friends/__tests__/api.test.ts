jest.mock('@/shared/api/client', () => ({
  apiClient: { delete: jest.fn(), get: jest.fn(), post: jest.fn() },
}));

// eslint-disable-next-line import/first
import { apiClient } from '@/shared/api/client';
// eslint-disable-next-line import/first
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  listFriends,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
  removeFriend,
  searchFriendUser,
  sendFriendRequest,
} from '../api';

const mockDelete = apiClient.delete as jest.MockedFunction<typeof apiClient.delete>;
const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
const mockPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>;

const friendUser = {
  id: 'user-2',
  display_name: 'Bob Example',
  identify_tag: 'bob#DEF456',
  avatar_url: '/media/avatars/bob.webp',
};

const friendship = {
  friendship_id: 'friendship-1',
  user: friendUser,
  created_at: '2026-07-22T01:00:00Z',
};

const friendRequest = {
  id: 'request-1',
  sender: friendUser,
  receiver: {
    id: 'user-1',
    display_name: 'Alice Example',
    identify_tag: 'alice#ABC123',
    avatar_url: null,
  },
  status: 'PENDING' as const,
  resolved_at: null,
  created_at: '2026-07-22T01:00:00Z',
};

describe('friends api', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists friends and normalizes the DRF cursor page', async () => {
    mockGet.mockResolvedValue({
      data: {
        next: 'http://testserver/api/friends/?cursor=next%3D%3D',
        previous: null,
        results: [friendship],
      },
    } as never);

    await expect(listFriends()).resolves.toEqual({
      items: [friendship],
      nextCursor: 'next==',
    });
    expect(mockGet).toHaveBeenCalledWith('/friends/', { params: undefined });
  });

  it('passes an opaque cursor when listing a subsequent friends page', async () => {
    mockGet.mockResolvedValue({
      data: { next: null, previous: null, results: [] },
    } as never);

    await expect(listFriends('opaque-cursor')).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(mockGet).toHaveBeenCalledWith('/friends/', {
      params: { cursor: 'opaque-cursor' },
    });
  });

  it('searches by identify tag with cancellation support and unwraps the user', async () => {
    const controller = new AbortController();
    mockGet.mockResolvedValue({ data: { user: friendUser } } as never);

    await expect(searchFriendUser('bob#DEF456', controller.signal)).resolves.toEqual(friendUser);
    expect(mockGet).toHaveBeenCalledWith('/friends/search', {
      params: { q: 'bob#DEF456' },
      signal: controller.signal,
    });
  });

  it('preserves the backend neutral not-found search result', async () => {
    mockGet.mockResolvedValue({ data: { user: null } } as never);

    await expect(searchFriendUser('nobody#ZZZ999')).resolves.toBeNull();
  });

  it('sends an identify tag and unwraps the friend request', async () => {
    mockPost.mockResolvedValue({ data: { friend_request: friendRequest } } as never);

    await expect(sendFriendRequest('bob#DEF456')).resolves.toEqual(friendRequest);
    expect(mockPost).toHaveBeenCalledWith('/friends/requests', {
      identify_tag: 'bob#DEF456',
    });
  });

  it.each([
    ['incoming', listIncomingFriendRequests],
    ['outgoing', listOutgoingFriendRequests],
  ] as const)('lists %s requests with cursor pagination', async (direction, request) => {
    mockGet.mockResolvedValue({
      data: { next: null, previous: null, results: [friendRequest] },
    } as never);

    await expect(request('request-cursor')).resolves.toEqual({
      items: [friendRequest],
      nextCursor: null,
    });
    expect(mockGet).toHaveBeenCalledWith(`/friends/requests/${direction}`, {
      params: { cursor: 'request-cursor' },
    });
  });

  it('accepts a request and normalizes the response keys', async () => {
    mockPost.mockResolvedValue({
      data: { friendship, friend_request_id: friendRequest.id },
    } as never);

    await expect(acceptFriendRequest(friendRequest.id)).resolves.toEqual({
      friendship,
      friendRequestId: friendRequest.id,
    });
    expect(mockPost).toHaveBeenCalledWith(
      `/friends/requests/${friendRequest.id}/accept`,
    );
  });

  it.each([
    ['decline', declineFriendRequest],
    ['cancel', cancelFriendRequest],
  ] as const)('%ss a request and unwraps the terminal request', async (action, request) => {
    const terminalRequest = {
      ...friendRequest,
      status: action === 'decline' ? ('DECLINED' as const) : ('CANCELLED' as const),
      resolved_at: '2026-07-22T02:00:00Z',
    };
    mockPost.mockResolvedValue({ data: { friend_request: terminalRequest } } as never);

    await expect(request(friendRequest.id)).resolves.toEqual(terminalRequest);
    expect(mockPost).toHaveBeenCalledWith(`/friends/requests/${friendRequest.id}/${action}`);
  });

  it('removes a friendship through the exact backend URL', async () => {
    mockDelete.mockResolvedValue({ data: undefined } as never);

    await expect(removeFriend(friendship.friendship_id)).resolves.toBeUndefined();
    expect(mockDelete).toHaveBeenCalledWith(`/friends/${friendship.friendship_id}`);
  });
});
