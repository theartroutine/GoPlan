jest.mock('@/shared/api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

// eslint-disable-next-line import/first
import { apiClient } from '@/shared/api/client';
// eslint-disable-next-line import/first
import {
  acceptTripInvitation,
  declineTripInvitation,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  normalizeNotification,
} from '../api';

const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
const mockPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>;

const notification = {
  id: 'notification-1',
  notification_type: 'FRIEND_REQUEST',
  actor: { id: 'user-2', display_name: 'Bob', identify_tag: 'bob#ABC123' },
  payload: {},
  is_read: false,
  read_at: null,
  created_at: '2026-07-22T01:00:00Z',
};

describe('notifications api', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists notifications, drops unusable records, and stores only the opaque cursor', async () => {
    mockGet.mockResolvedValue({
      data: {
        next: 'http://testserver/api/notifications/?cursor=opaque%3D%3D',
        previous: null,
        results: [notification, { payload: { raw: 'missing id' } }],
      },
    } as never);

    await expect(listNotifications()).resolves.toEqual({ items: [notification], nextCursor: 'opaque==' });
    expect(mockGet).toHaveBeenCalledWith('/notifications/', { params: undefined });
  });

  it('passes only the opaque cursor on later pages', async () => {
    mockGet.mockResolvedValue({ data: { next: null, previous: null, results: [] } } as never);
    await listNotifications('cursor-token');
    expect(mockGet).toHaveBeenCalledWith('/notifications/', { params: { cursor: 'cursor-token' } });
  });

  it('normalizes malformed optional actor and payload data without exposing assumptions', () => {
    expect(normalizeNotification({ ...notification, actor: { display_name: 42 }, payload: 'legacy' })).toEqual({
      ...notification,
      actor: null,
      payload: 'legacy',
    });
    expect(normalizeNotification({ payload: {} })).toBeNull();
  });

  it('loads a finite non-negative unread count and rejects malformed count data', async () => {
    mockGet.mockResolvedValueOnce({ data: { unread_count: 7 } } as never);
    await expect(getUnreadCount()).resolves.toBe(7);
    expect(mockGet).toHaveBeenCalledWith('/notifications/unread-count');

    mockGet.mockResolvedValueOnce({ data: { unread_count: -1 } } as never);
    await expect(getUnreadCount()).rejects.toThrow('Invalid unread notification count response.');
  });

  it('uses the exact read and invitation mutation endpoints', async () => {
    mockPost.mockResolvedValue({ data: {} } as never);

    await markNotificationRead('notification-1');
    await markAllNotificationsRead();
    await acceptTripInvitation('invitation-1');
    await declineTripInvitation('invitation-2');

    expect(mockPost.mock.calls).toEqual([
      ['/notifications/notification-1/read'],
      ['/notifications/read-all'],
      ['/invitations/invitation-1/accept'],
      ['/invitations/invitation-2/decline'],
    ]);
  });
});
