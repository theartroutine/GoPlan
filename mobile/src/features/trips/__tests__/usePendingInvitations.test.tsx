const mockUseFocusEffect = jest.fn();
const mockUseAppForegroundEffect = jest.fn();

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => (() => void) | void) => mockUseFocusEffect(effect),
}));

jest.mock('@/shared/hooks/useAppForegroundEffect', () => ({
  useAppForegroundEffect: (listener: () => void) => mockUseAppForegroundEffect(listener),
}));

jest.mock('../api', () => ({
  listPendingInvitations: jest.fn(),
}));

// eslint-disable-next-line import/first
import { act, renderHook, waitFor } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { listPendingInvitations } from '../api';
// eslint-disable-next-line import/first
import { usePendingInvitations } from '../hooks/usePendingInvitations';
// eslint-disable-next-line import/first
import { publishTripEvent } from '../tripEvents';
// eslint-disable-next-line import/first
import type { TripInvitation } from '../types';

const mockListPendingInvitations = listPendingInvitations as jest.MockedFunction<
  typeof listPendingInvitations
>;

const invitation: TripInvitation = {
  id: 'invitation-1',
  invitee: {
    id: 'user-1',
    display_name: 'Lan Nguyen',
    identify_tag: 'lan#1234',
  },
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

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe('usePendingInvitations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads independently on focus only for a captain', async () => {
    mockListPendingInvitations.mockResolvedValue([invitation]);
    const disabled = await renderHook(() => usePendingInvitations('trip-1', false));

    await act(async () => {
      latestFocusCallback()();
    });
    expect(mockListPendingInvitations).not.toHaveBeenCalled();
    await disabled.unmount();

    const { result } = await renderHook(() => usePendingInvitations('trip-1', true));
    await act(async () => {
      latestFocusCallback()();
    });
    await waitFor(() => expect(result.current.items).toEqual([invitation]));
    expect(result.current.status).toBe('ready');
  });

  it('exposes an isolated first-load error without affecting trip detail state', async () => {
    mockListPendingInvitations.mockRejectedValue(new Error('offline'));
    const { result } = await renderHook(() => usePendingInvitations('trip-1', true));

    await act(async () => {
      latestFocusCallback()();
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.message).toBe('Something went wrong. Please try again.');
    expect(result.current.items).toEqual([]);
  });

  it('keeps rendered invitations when a foreground refresh fails', async () => {
    mockListPendingInvitations
      .mockResolvedValueOnce([invitation])
      .mockRejectedValueOnce(new Error('offline'));
    const { result } = await renderHook(() => usePendingInvitations('trip-1', true));
    await act(async () => {
      latestFocusCallback()();
    });
    await waitFor(() => expect(result.current.items).toEqual([invitation]));

    await act(async () => {
      latestForegroundCallback()();
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.items).toEqual([invitation]);
    expect(result.current.error).not.toBeNull();
  });

  it('reconciles pending invitations when the app returns to foreground', async () => {
    const newerInvitation = {
      ...invitation,
      id: 'invitation-2',
      invitee: { ...invitation.invitee, id: 'user-2', display_name: 'Mai' },
    };
    mockListPendingInvitations
      .mockResolvedValueOnce([invitation])
      .mockResolvedValueOnce([newerInvitation]);
    const { result } = await renderHook(() => usePendingInvitations('trip-1', true));
    await act(async () => {
      latestFocusCallback()();
    });
    await waitFor(() => expect(result.current.items).toEqual([invitation]));

    await act(async () => {
      latestForegroundCallback()();
    });

    await waitFor(() => expect(result.current.items).toEqual([newerInvitation]));
    expect(mockListPendingInvitations).toHaveBeenCalledTimes(2);
  });

  it('upserts sent invitations and rejects an older pending response', async () => {
    const staleResponse = deferred<TripInvitation[]>();
    const newerInvitation: TripInvitation = {
      ...invitation,
      id: 'invitation-2',
      invitee: { ...invitation.invitee, id: 'user-2', display_name: 'Mai' },
      created_at: '2026-07-22T09:00:00Z',
    };
    mockListPendingInvitations.mockReturnValue(staleResponse.promise);
    const { result } = await renderHook(() => usePendingInvitations('trip-1', true));
    await act(async () => {
      latestFocusCallback()();
      publishTripEvent({
        type: 'invitationsSent',
        tripId: 'trip-1',
        invitations: [newerInvitation],
      });
    });
    expect(result.current.items).toEqual([newerInvitation]);

    await act(async () => {
      staleResponse.resolve([invitation]);
    });

    expect(result.current.items).toEqual([newerInvitation]);
    expect(result.current.status).toBe('ready');
  });

  it('does not merge invitations retained from a previous trip into the next trip', async () => {
    const nextTripInvitation: TripInvitation = {
      ...invitation,
      id: 'invitation-2',
      invitee: { ...invitation.invitee, id: 'user-2', display_name: 'Mai' },
    };
    mockListPendingInvitations.mockResolvedValue([invitation]);
    const { result, rerender } = await renderHook<
      ReturnType<typeof usePendingInvitations>,
      { currentTripId: string }
    >(
      ({ currentTripId }) => usePendingInvitations(currentTripId, true),
      { initialProps: { currentTripId: 'trip-1' } },
    );
    await act(async () => {
      latestFocusCallback()();
    });
    await waitFor(() => expect(result.current.items).toEqual([invitation]));

    await rerender({ currentTripId: 'trip-2' });
    await act(async () => {
      publishTripEvent({
        type: 'invitationsSent',
        tripId: 'trip-2',
        invitations: [nextTripInvitation],
      });
    });

    expect(result.current.items).toEqual([nextTripInvitation]);
  });
});
