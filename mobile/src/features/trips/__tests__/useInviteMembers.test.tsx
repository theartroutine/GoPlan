const mockUseFocusEffect = jest.fn();
const mockUseAppForegroundEffect = jest.fn();
const mockPublishTripEvent = jest.fn();

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => (() => void) | void) => mockUseFocusEffect(effect),
}));

jest.mock('@/shared/hooks/useAppForegroundEffect', () => ({
  useAppForegroundEffect: (listener: () => void) => mockUseAppForegroundEffect(listener),
}));

jest.mock('../api', () => ({
  listInvitableFriends: jest.fn(),
  sendTripInvitations: jest.fn(),
}));

jest.mock('../tripEvents', () => ({
  publishTripEvent: (...args: unknown[]) => mockPublishTripEvent(...args),
}));

// eslint-disable-next-line import/first
import { act, renderHook, waitFor } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { AxiosError, AxiosHeaders } from 'axios';
// eslint-disable-next-line import/first
import { listInvitableFriends, sendTripInvitations } from '../api';
// eslint-disable-next-line import/first
import { MAX_INVITEES_PER_REQUEST, useInviteMembers } from '../hooks/useInviteMembers';
// eslint-disable-next-line import/first
import type { InvitableFriend, TripInvitation } from '../types';

const mockListInvitableFriends = listInvitableFriends as jest.MockedFunction<
  typeof listInvitableFriends
>;
const mockSendTripInvitations = sendTripInvitations as jest.MockedFunction<
  typeof sendTripInvitations
>;

const friend: InvitableFriend = {
  id: 'user-1',
  display_name: 'Lan Nguyen',
  identify_tag: 'lan#1234',
};

const invitation: TripInvitation = {
  id: 'invitation-1',
  invitee: friend,
  status: 'PENDING',
  created_at: '2026-07-22T08:00:00Z',
};

function latestFocusCallback(): () => (() => void) | void {
  const callback = mockUseFocusEffect.mock.calls.at(-1)?.[0] as
    | (() => (() => void) | void)
    | undefined;
  if (!callback) {
    throw new Error('Expected useFocusEffect to register a callback.');
  }
  return callback;
}

function latestForegroundCallback(): () => void {
  const callback = mockUseAppForegroundEffect.mock.calls.at(-1)?.[0] as (() => void) | undefined;
  if (!callback) {
    throw new Error('Expected useAppForegroundEffect to register a callback.');
  }
  return callback;
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

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe('useInviteMembers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads eligible friends on focus only when the route guard enables it', async () => {
    mockListInvitableFriends.mockResolvedValue([friend]);
    const disabled = await renderHook(() => useInviteMembers('trip-1', false));

    await act(async () => {
      latestFocusCallback()();
    });
    expect(mockListInvitableFriends).not.toHaveBeenCalled();
    await disabled.unmount();

    const { result } = await renderHook(() => useInviteMembers('trip-1', true));
    await act(async () => {
      latestFocusCallback()();
    });

    await waitFor(() => expect(result.current.items).toEqual([friend]));
    expect(mockListInvitableFriends).toHaveBeenCalledWith('trip-1');
    expect(result.current.status).toBe('ready');
  });

  it('keeps selection unique and enforces the backend maximum of 20', async () => {
    const friends = Array.from({ length: MAX_INVITEES_PER_REQUEST + 1 }, (_, index) => ({
      ...friend,
      id: `user-${index + 1}`,
      identify_tag: `user#${index + 1}`,
    }));
    mockListInvitableFriends.mockResolvedValue(friends);
    const { result } = await renderHook(() => useInviteMembers('trip-1', true));
    await act(async () => {
      latestFocusCallback()();
    });
    await waitFor(() => expect(result.current.items).toHaveLength(friends.length));

    await act(async () => {
      for (const item of friends.slice(0, MAX_INVITEES_PER_REQUEST)) {
        result.current.toggleSelection(item.id);
      }
      result.current.toggleSelection(friends[0].id);
      result.current.toggleSelection(friends[0].id);
      result.current.toggleSelection(friends[MAX_INVITEES_PER_REQUEST].id);
    });

    expect(result.current.selectedIds.size).toBe(MAX_INVITEES_PER_REQUEST);
    expect(result.current.selectionError).toBe('You can select up to 20 friends.');
  });

  it('handles an empty selection without calling the API', async () => {
    mockListInvitableFriends.mockResolvedValue([]);
    const { result } = await renderHook(() => useInviteMembers('trip-1', true));
    await act(async () => {
      latestFocusCallback()();
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let succeeded = true;
    await act(async () => {
      succeeded = await result.current.submit();
    });

    expect(succeeded).toBe(false);
    expect(mockSendTripInvitations).not.toHaveBeenCalled();
    expect(result.current.selectionError).toBe('Select at least one friend.');
  });

  it('blocks duplicate submits, publishes created invitations, and clears selection', async () => {
    const pending = deferred<TripInvitation[]>();
    mockListInvitableFriends.mockResolvedValue([friend]);
    mockSendTripInvitations.mockReturnValue(pending.promise);
    const { result } = await renderHook(() => useInviteMembers('trip-1', true));
    await act(async () => {
      latestFocusCallback()();
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      result.current.toggleSelection(friend.id);
    });

    let firstSubmit: Promise<boolean> = Promise.resolve(false);
    let secondResult = true;
    await act(async () => {
      firstSubmit = result.current.submit();
      secondResult = await result.current.submit();
    });
    expect(secondResult).toBe(false);
    expect(mockSendTripInvitations).toHaveBeenCalledTimes(1);
    expect(mockSendTripInvitations).toHaveBeenCalledWith('trip-1', ['user-1']);

    await act(async () => {
      pending.resolve([invitation]);
      await firstSubmit;
    });

    expect(mockPublishTripEvent).toHaveBeenCalledWith({
      type: 'invitationsSent',
      tripId: 'trip-1',
      invitations: [invitation],
    });
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.submitting).toBe(false);
  });

  it('normalizes backend field and business errors without clearing selection', async () => {
    mockListInvitableFriends.mockResolvedValue([friend]);
    mockSendTripInvitations.mockRejectedValue(
      axiosErrorWith(400, { invitee_ids: ['Choose no more than 20 users.'] }),
    );
    const { result } = await renderHook(() => useInviteMembers('trip-1', true));
    await act(async () => {
      latestFocusCallback()();
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      result.current.toggleSelection(friend.id);
      await result.current.submit();
    });

    expect(result.current.submitError).toMatchObject({
      kind: 'field',
      fieldErrors: { invitee_ids: 'Choose no more than 20 users.' },
    });
    expect(result.current.selectedIds.has(friend.id)).toBe(true);
  });

  it('does not let an eligible-friends response started before send restore invitees', async () => {
    const staleFriends = deferred<InvitableFriend[]>();
    mockListInvitableFriends
      .mockResolvedValueOnce([friend])
      .mockReturnValueOnce(staleFriends.promise);
    mockSendTripInvitations.mockResolvedValue([invitation]);
    const { result } = await renderHook(() => useInviteMembers('trip-1', true));
    await act(async () => {
      latestFocusCallback()();
    });
    await waitFor(() => expect(result.current.items).toEqual([friend]));

    await act(async () => {
      void result.current.load('silent');
      result.current.toggleSelection(friend.id);
      await result.current.submit();
    });
    expect(result.current.items).toEqual([]);

    await act(async () => {
      staleFriends.resolve([friend]);
    });
    expect(result.current.items).toEqual([]);
  });

  it('removes invisible selections when foreground refresh changes eligibility', async () => {
    mockListInvitableFriends
      .mockResolvedValueOnce([friend])
      .mockResolvedValueOnce([]);
    const { result } = await renderHook(() => useInviteMembers('trip-1', true));
    await act(async () => {
      latestFocusCallback()();
    });
    await waitFor(() => expect(result.current.items).toEqual([friend]));
    await act(async () => {
      result.current.toggleSelection(friend.id);
      latestForegroundCallback()();
    });

    await waitFor(() => expect(result.current.items).toEqual([]));
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.selectionError).toBeNull();
    await act(async () => {
      await result.current.submit();
    });
    expect(mockSendTripInvitations).not.toHaveBeenCalled();
  });

  it('keeps eligible friends and selections when foreground refresh fails', async () => {
    mockListInvitableFriends
      .mockResolvedValueOnce([friend])
      .mockRejectedValueOnce(new Error('offline'));
    const { result } = await renderHook(() => useInviteMembers('trip-1', true));
    await act(async () => {
      latestFocusCallback()();
    });
    await waitFor(() => expect(result.current.items).toEqual([friend]));
    await act(async () => {
      result.current.toggleSelection(friend.id);
      latestForegroundCallback()();
    });

    await waitFor(() => expect(result.current.loadError).not.toBeNull());
    expect(result.current.items).toEqual([friend]);
    expect(result.current.selectedIds.has(friend.id)).toBe(true);
    expect(result.current.status).toBe('ready');
  });
});
