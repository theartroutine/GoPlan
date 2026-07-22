jest.mock('../api', () => ({
  acceptTripInvitation: jest.fn(),
  declineTripInvitation: jest.fn(),
  getUnreadCount: jest.fn(),
  listNotifications: jest.fn(),
  markAllNotificationsRead: jest.fn(),
  markNotificationRead: jest.fn(),
}));
jest.mock('@/features/trips/tripEvents', () => ({ publishTripEvent: jest.fn() }));

// eslint-disable-next-line import/first
import { AxiosError, AxiosHeaders } from 'axios';
// eslint-disable-next-line import/first
import { type PropsWithChildren } from 'react';
// eslint-disable-next-line import/first
import { AppState, Pressable, Text, View } from 'react-native';
// eslint-disable-next-line import/first
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { publishTripEvent } from '@/features/trips/tripEvents';
// eslint-disable-next-line import/first
import {
  acceptTripInvitation,
  declineTripInvitation,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api';
// eslint-disable-next-line import/first
import { NotificationsProvider, useNotifications } from '../application/NotificationsProvider';
// eslint-disable-next-line import/first
import type { NotificationItem, NotificationPage } from '../types';

const mockAccept = acceptTripInvitation as jest.MockedFunction<typeof acceptTripInvitation>;
const mockDecline = declineTripInvitation as jest.MockedFunction<typeof declineTripInvitation>;
const mockGetUnread = getUnreadCount as jest.MockedFunction<typeof getUnreadCount>;
const mockList = listNotifications as jest.MockedFunction<typeof listNotifications>;
const mockMarkAll = markAllNotificationsRead as jest.MockedFunction<typeof markAllNotificationsRead>;
const mockMarkRead = markNotificationRead as jest.MockedFunction<typeof markNotificationRead>;
const mockPublishTripEvent = publishTripEvent as jest.MockedFunction<typeof publishTripEvent>;

const notification: NotificationItem = {
  id: 'notification-1',
  notification_type: 'FRIEND_REQUEST',
  actor: { id: 'user-2', display_name: 'Bob', identify_tag: 'bob#ABC123' },
  payload: {},
  is_read: false,
  read_at: null,
  created_at: '2026-07-22T01:00:00Z',
};

const invitation: NotificationItem = {
  ...notification,
  id: 'notification-invite',
  notification_type: 'TRIP_INVITATION',
  payload: {
    trip_id: 'trip-1',
    trip_name: 'Da Lat escape',
    destination: 'Da Lat',
    start_date: '2026-08-01',
    end_date: '2026-08-03',
    invitation_id: 'invitation-1',
    invitation_status: 'PENDING',
  },
};

function page(items: NotificationItem[], nextCursor: string | null = null): NotificationPage {
  return { items, nextCursor };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function axiosErrorWith(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, {}, {
    status,
    statusText: '',
    headers: {},
    config,
    data,
  });
}

function wrapper({ children }: PropsWithChildren) {
  return <NotificationsProvider ownerUserId="user-1">{children}</NotificationsProvider>;
}

function StateProbe({
  onInvitationResponse,
}: {
  onInvitationResponse?: (response: Promise<boolean>) => void;
}) {
  const state = useNotifications();
  return (
    <View>
      <Text testID="notification-state">{`${state.unreadCount ?? 'none'}:${state.items.length}`}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Load notifications" onPress={state.refreshForFocus} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Accept invitation"
        onPress={() =>
          onInvitationResponse?.(
            state.respondToInvitation(
              invitation.id,
              'invitation-1',
              'trip-1',
              'accept',
            ),
          )
        }
      />
    </View>
  );
}

async function renderLoaded(items: NotificationItem[] = [notification], nextCursor: string | null = null) {
  mockList.mockResolvedValueOnce(page(items, nextCursor));
  const rendered = await renderHook(useNotifications, { wrapper });
  await act(async () => rendered.result.current.refreshForFocus());
  await waitFor(() => expect(rendered.result.current.status).toBe('ready'));
  return rendered;
}

describe('NotificationsProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUnread.mockResolvedValue(1);
    mockMarkRead.mockResolvedValue(undefined);
    mockMarkAll.mockResolvedValue(1);
    mockAccept.mockResolvedValue(undefined);
    mockDecline.mockResolvedValue(undefined);
  });

  it('loads cursor pages with de-duplication and retains the failed cursor for retry', async () => {
    const second = { ...notification, id: 'notification-2' };
    const rendered = await renderLoaded([notification], 'next-cursor');
    mockList.mockResolvedValueOnce(page([notification, second], 'last-cursor'));

    await act(async () => rendered.result.current.loadMore());
    expect(mockList).toHaveBeenLastCalledWith('next-cursor');
    expect(rendered.result.current.items.map((item) => item.id)).toEqual(['notification-1', 'notification-2']);

    mockList.mockRejectedValueOnce(axiosErrorWith(503, { detail: 'Notifications are temporarily unavailable.' }));
    await act(async () => rendered.result.current.loadMore());
    expect(rendered.result.current.errorSource).toBe('loadMore');
    expect(rendered.result.current.items).toHaveLength(2);

    mockList.mockResolvedValueOnce(page([], null));
    await act(async () => rendered.result.current.loadMore());
    expect(mockList).toHaveBeenLastCalledWith('last-cursor');
  });

  it('keeps rendered notifications after a non-destructive refresh error', async () => {
    const rendered = await renderLoaded();
    mockList.mockRejectedValueOnce(axiosErrorWith(500, { detail: 'Try again later.' }));

    await act(async () => rendered.result.current.refresh());

    expect(rendered.result.current.status).toBe('ready');
    expect(rendered.result.current.items).toEqual([notification]);
    expect(rendered.result.current.errorSource).toBe('refresh');
    expect(rendered.result.current.error?.message).toBe('Try again later.');
  });

  it('keeps a successful read over a list response that started before the mutation', async () => {
    const rendered = await renderLoaded();
    const staleRefresh = deferred<NotificationPage>();
    mockList.mockReturnValueOnce(staleRefresh.promise);

    let refreshPromise!: Promise<void>;
    await act(() => {
      refreshPromise = rendered.result.current.refreshForFocus();
    });
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    await act(async () => rendered.result.current.markRead(notification.id));
    await act(async () => {
      staleRefresh.resolve(page([notification]));
      await refreshPromise;
    });

    await waitFor(() => expect(rendered.result.current.items[0]?.is_read).toBe(true));
    expect(mockMarkRead).toHaveBeenCalledTimes(1);
  });

  it('ignores an older unread-count response after a read reconciliation has completed', async () => {
    mockGetUnread.mockResolvedValue(5);
    const rendered = await renderLoaded();
    await waitFor(() => expect(rendered.result.current.unreadCount).toBe(5));
    mockGetUnread.mockReset();
    const staleCount = deferred<number>();
    mockGetUnread.mockReturnValueOnce(staleCount.promise).mockResolvedValueOnce(4);
    mockList.mockResolvedValueOnce(page([notification]));

    let refreshPromise!: Promise<void>;
    await act(() => {
      refreshPromise = rendered.result.current.refreshForFocus();
    });
    await waitFor(() => expect(mockGetUnread).toHaveBeenCalledTimes(1));
    await act(async () => rendered.result.current.markRead(notification.id));
    await act(async () => {
      staleCount.resolve(5);
      await refreshPromise;
    });

    expect(rendered.result.current.unreadCount).toBe(4);
  });

  it('shares one synchronous invitation lock and publishes accepted-trip reconciliation', async () => {
    const rendered = await renderLoaded([invitation]);
    const pendingAccept = deferred<void>();
    mockAccept.mockReturnValueOnce(pendingAccept.promise);
    mockList.mockResolvedValueOnce(
      page([{ ...invitation, is_read: true, payload: { ...(invitation.payload as object), invitation_status: 'ACCEPTED' } }]),
    );

    let first!: Promise<boolean>;
    let duplicate!: Promise<boolean>;
    await act(() => {
      first = rendered.result.current.respondToInvitation(
        invitation.id,
        'invitation-1',
        'trip-1',
        'accept',
      );
      duplicate = rendered.result.current.respondToInvitation(
        invitation.id,
        'invitation-1',
        'trip-1',
        'decline',
      );
    });
    await expect(duplicate).resolves.toBe(false);
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockDecline).not.toHaveBeenCalled();

    await act(async () => {
      pendingAccept.resolve();
      await first;
    });

    expect(mockPublishTripEvent).toHaveBeenCalledWith({ type: 'membershipAdded', tripId: 'trip-1' });
    expect(mockMarkRead).toHaveBeenCalledWith(invitation.id);
    expect(rendered.result.current.items[0]?.is_read).toBe(true);
    expect(rendered.result.current.items[0]?.payload).toEqual(
      expect.objectContaining({ invitation_status: 'ACCEPTED' }),
    );
  });

  it('declines successfully, marks the notification read, and does not publish a trip event', async () => {
    const rendered = await renderLoaded([invitation]);
    mockList.mockResolvedValueOnce(
      page([
        {
          ...invitation,
          is_read: true,
          payload: { ...(invitation.payload as object), invitation_status: 'DECLINED' },
        },
      ]),
    );

    let succeeded = false;
    await act(async () => {
      succeeded = await rendered.result.current.respondToInvitation(
        invitation.id,
        'invitation-1',
        'trip-1',
        'decline',
      );
    });

    expect(succeeded).toBe(true);
    expect(mockDecline).toHaveBeenCalledWith('invitation-1');
    expect(mockAccept).not.toHaveBeenCalled();
    expect(mockMarkRead).toHaveBeenCalledWith(invitation.id);
    expect(mockPublishTripEvent).not.toHaveBeenCalled();
    expect(rendered.result.current.items[0]?.is_read).toBe(true);
    expect(rendered.result.current.items[0]?.payload).toEqual(
      expect.objectContaining({ invitation_status: 'DECLINED' }),
    );
  });

  it('fails a stale 409 invitation closed, displays the backend message, and refreshes server status', async () => {
    const rendered = await renderLoaded([invitation]);
    mockAccept.mockRejectedValueOnce(
      axiosErrorWith(409, { detail: 'This invitation is no longer pending.', error_code: 'INVITATION_NOT_PENDING' }),
    );
    mockList.mockResolvedValueOnce(
      page([{ ...invitation, payload: { ...(invitation.payload as object), invitation_status: 'CANCELLED' } }]),
    );

    await act(async () =>
      rendered.result.current.respondToInvitation(invitation.id, 'invitation-1', 'trip-1', 'accept'),
    );

    expect(rendered.result.current.rowErrors.get(invitation.id)?.message).toBe(
      'This invitation is no longer pending.',
    );
    expect(rendered.result.current.items[0]?.payload).toEqual(
      expect.objectContaining({ invitation_status: 'CANCELLED' }),
    );
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('fails a stale 404 invitation closed before reconciling server status', async () => {
    const rendered = await renderLoaded([invitation]);
    const refreshedPage = deferred<NotificationPage>();
    mockAccept.mockRejectedValueOnce(
      axiosErrorWith(404, { detail: 'Invitation not found.', error_code: 'INVITATION_NOT_FOUND' }),
    );
    mockList.mockReturnValueOnce(refreshedPage.promise);

    let response!: Promise<boolean>;
    await act(() => {
      response = rendered.result.current.respondToInvitation(
        invitation.id,
        'invitation-1',
        'trip-1',
        'accept',
      );
    });

    await waitFor(() =>
      expect(rendered.result.current.items[0]?.payload).toEqual(
        expect.objectContaining({ invitation_status: null }),
      ),
    );
    expect(rendered.result.current.rowErrors.get(invitation.id)?.message).toBe(
      'Invitation not found.',
    );
    expect(mockList).toHaveBeenCalledTimes(2);

    await act(async () => {
      refreshedPage.resolve(
        page([
          {
            ...invitation,
            payload: { ...(invitation.payload as object), invitation_status: 'CANCELLED' },
          },
        ]),
      );
      await response;
    });
    expect(rendered.result.current.items[0]?.payload).toEqual(
      expect.objectContaining({ invitation_status: 'CANCELLED' }),
    );
    expect(mockPublishTripEvent).not.toHaveBeenCalled();
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('keeps mark-all over an older list response and clamps the badge at zero', async () => {
    mockGetUnread.mockResolvedValue(2);
    const second = { ...notification, id: 'notification-2' };
    const rendered = await renderLoaded([notification, second]);
    const staleRefresh = deferred<NotificationPage>();
    mockList.mockReturnValueOnce(staleRefresh.promise);
    let refreshPromise!: Promise<void>;
    await act(() => {
      refreshPromise = rendered.result.current.refreshForFocus();
    });
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    mockGetUnread.mockResolvedValue(0);

    await act(async () => rendered.result.current.markAllRead());
    await act(async () => {
      staleRefresh.resolve(page([notification, second]));
      await refreshPromise;
    });

    expect(rendered.result.current.items.every((item) => item.is_read)).toBe(true);
    expect(rendered.result.current.unreadCount).toBe(0);
  });

  it('reconciles both the badge and loaded list when the app returns to foreground', async () => {
    let onChange: ((state: 'active' | 'background') => void) | undefined;
    const remove = jest.fn();
    const appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      onChange = listener as (state: 'active' | 'background') => void;
      return { remove };
    });
    const rendered = await renderLoaded();
    mockList.mockClear();
    mockGetUnread.mockClear();
    mockList.mockResolvedValue(page([notification]));

    await act(() => onChange?.('background'));
    await act(() => onChange?.('active'));

    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
    expect(mockGetUnread).toHaveBeenCalledTimes(1);
    await rendered.unmount();
    await waitFor(() => expect(remove).toHaveBeenCalled());
    appStateSpy.mockRestore();
  });

  it('retries an initially failed requested list when the app returns to foreground', async () => {
    let onChange: ((state: 'active' | 'background') => void) | undefined;
    const remove = jest.fn();
    const appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      onChange = listener as (state: 'active' | 'background') => void;
      return { remove };
    });
    mockList.mockRejectedValueOnce(
      axiosErrorWith(503, { detail: 'Notifications are temporarily unavailable.' }),
    );
    const rendered = await renderHook(useNotifications, { wrapper });
    await act(async () => rendered.result.current.refreshForFocus());
    expect(rendered.result.current.status).toBe('error');
    expect(rendered.result.current.errorSource).toBe('initial');

    mockList.mockResolvedValueOnce(page([notification]));
    await act(() => onChange?.('background'));
    await act(() => onChange?.('active'));

    await waitFor(() => expect(rendered.result.current.status).toBe('ready'));
    expect(rendered.result.current.items).toEqual([notification]);
    expect(mockList).toHaveBeenCalledTimes(2);
    await rendered.unmount();
    expect(remove).toHaveBeenCalled();
    appStateSpy.mockRestore();
  });

  it('resets badge, list, locks, and errors when the authenticated owner changes', async () => {
    mockGetUnread.mockReset();
    mockGetUnread.mockResolvedValueOnce(3).mockResolvedValueOnce(3).mockResolvedValue(0);
    mockList.mockResolvedValueOnce(page([notification])).mockResolvedValueOnce(page([]));
    const rendered = await render(
      <NotificationsProvider ownerUserId="user-1">
        <StateProbe />
      </NotificationsProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Load notifications' }));
    await waitFor(() => expect(screen.getByTestId('notification-state').props.children).toBe('3:1'));

    await rendered.rerender(
      <NotificationsProvider ownerUserId="user-2">
        <StateProbe />
      </NotificationsProvider>,
    );
    expect(screen.getByTestId('notification-state').props.children).not.toBe('3:1');
    await fireEvent.press(screen.getByRole('button', { name: 'Load notifications' }));
    await waitFor(() => expect(screen.getByTestId('notification-state').props.children).toBe('0:0'));
  });

  it('does not finish an old owner invitation response under the new owner lifetime', async () => {
    const pendingAccept = deferred<void>();
    mockAccept.mockReturnValueOnce(pendingAccept.promise);
    mockList.mockResolvedValueOnce(page([invitation]));
    let oldOwnerResponse: Promise<boolean> | undefined;
    const rendered = await render(
      <NotificationsProvider ownerUserId="user-1">
        <StateProbe onInvitationResponse={(response) => { oldOwnerResponse = response; }} />
      </NotificationsProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Load notifications' }));
    await waitFor(() => expect(screen.getByTestId('notification-state').props.children).toBe('1:1'));
    await fireEvent.press(screen.getByRole('button', { name: 'Accept invitation' }));
    await waitFor(() => expect(mockAccept).toHaveBeenCalledTimes(1));

    await rendered.rerender(
      <NotificationsProvider ownerUserId="user-2">
        <StateProbe />
      </NotificationsProvider>,
    );
    await waitFor(() => expect(mockGetUnread).toHaveBeenCalledTimes(3));
    const listCallsBeforeResolution = mockList.mock.calls.length;
    const countCallsBeforeResolution = mockGetUnread.mock.calls.length;

    await act(async () => {
      pendingAccept.resolve();
      await oldOwnerResponse;
    });

    await expect(oldOwnerResponse).resolves.toBe(false);
    expect(mockPublishTripEvent).not.toHaveBeenCalled();
    expect(mockMarkRead).not.toHaveBeenCalled();
    expect(mockList).toHaveBeenCalledTimes(listCallsBeforeResolution);
    expect(mockGetUnread).toHaveBeenCalledTimes(countCallsBeforeResolution);
    expect(screen.getByTestId('notification-state').props.children).toBe('1:0');
  });
});
