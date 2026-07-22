jest.mock('../api', () => ({
  acceptFriendRequest: jest.fn(),
  cancelFriendRequest: jest.fn(),
  declineFriendRequest: jest.fn(),
  listIncomingFriendRequests: jest.fn(),
  listOutgoingFriendRequests: jest.fn(),
}));

jest.mock('@/features/auth/session', () => ({
  useSession: () => ({ user: { id: 'user-current' } }),
}));

// eslint-disable-next-line import/first
import { AxiosError, AxiosHeaders } from 'axios';
// eslint-disable-next-line import/first
import { act, renderHook } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
} from '../api';
// eslint-disable-next-line import/first
import { subscribeToFriendEvents, type FriendEvent } from '../friendEvents';
// eslint-disable-next-line import/first
import { useFriendRequests } from '../hooks/useFriendRequests';
// eslint-disable-next-line import/first
import type { Friend, FriendRequest, FriendUser } from '../types';

const mockAcceptFriendRequest = acceptFriendRequest as jest.MockedFunction<typeof acceptFriendRequest>;
const mockCancelFriendRequest = cancelFriendRequest as jest.MockedFunction<typeof cancelFriendRequest>;
const mockDeclineFriendRequest = declineFriendRequest as jest.MockedFunction<typeof declineFriendRequest>;
const mockListIncoming = listIncomingFriendRequests as jest.MockedFunction<typeof listIncomingFriendRequests>;
const mockListOutgoing = listOutgoingFriendRequests as jest.MockedFunction<typeof listOutgoingFriendRequests>;

const currentUser: FriendUser = {
  id: 'user-current',
  display_name: 'Quang Minh',
  identify_tag: 'quangminh#QM01',
  avatar_url: null,
};

const friendUser: FriendUser = {
  id: 'user-friend',
  display_name: 'Minh Anh',
  identify_tag: 'minhanh#MA02',
  avatar_url: null,
};

const otherUser: FriendUser = {
  id: 'user-other',
  display_name: 'Lan Anh',
  identify_tag: 'lananh#LA03',
  avatar_url: null,
};

const friendship: Friend = {
  friendship_id: 'friendship-1',
  user: friendUser,
  created_at: '2026-07-22T01:00:00Z',
};

function incomingRequest(id: string, sender: FriendUser = friendUser): FriendRequest {
  return {
    id,
    sender,
    receiver: currentUser,
    status: 'PENDING',
    resolved_at: null,
    created_at: '2026-07-22T00:00:00Z',
  };
}

function outgoingRequest(id: string, receiver: FriendUser = friendUser): FriendRequest {
  return {
    id,
    sender: currentUser,
    receiver,
    status: 'PENDING',
    resolved_at: null,
    created_at: '2026-07-22T00:00:00Z',
  };
}

function resolvedRequest(request: FriendRequest, status: 'DECLINED' | 'CANCELLED'): FriendRequest {
  return { ...request, status, resolved_at: '2026-07-22T02:00:00Z' };
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
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe('useFriendRequests', () => {
  beforeEach(() => {
    mockAcceptFriendRequest.mockReset();
    mockCancelFriendRequest.mockReset();
    mockDeclineFriendRequest.mockReset();
    mockListIncoming.mockReset();
    mockListOutgoing.mockReset();
  });

  it('loads and paginates incoming and outgoing requests independently with cursor de-duplication', async () => {
    const incomingA = incomingRequest('incoming-a');
    const incomingB = incomingRequest('incoming-b', otherUser);
    const outgoingA = outgoingRequest('outgoing-a');
    const outgoingB = outgoingRequest('outgoing-b', otherUser);
    mockListIncoming
      .mockResolvedValueOnce({ items: [incomingA], nextCursor: 'incoming-cursor' })
      .mockResolvedValueOnce({ items: [incomingA, incomingB], nextCursor: null });
    mockListOutgoing
      .mockResolvedValueOnce({ items: [outgoingA], nextCursor: 'outgoing-cursor' })
      .mockResolvedValueOnce({ items: [outgoingA, outgoingB], nextCursor: null });
    const { result } = await renderHook(() => useFriendRequests());

    await act(async () => {
      await result.current.incoming.loadFirstPage('initial');
    });
    expect(mockListOutgoing).not.toHaveBeenCalled();
    expect(result.current.incoming.items).toEqual([incomingA]);
    expect(result.current.outgoing.items).toEqual([]);

    await act(async () => {
      await result.current.outgoing.loadFirstPage('initial');
    });
    await act(async () => {
      await Promise.all([result.current.incoming.loadMore(), result.current.outgoing.loadMore()]);
    });

    expect(mockListIncoming).toHaveBeenNthCalledWith(1);
    expect(mockListIncoming).toHaveBeenNthCalledWith(2, 'incoming-cursor');
    expect(mockListOutgoing).toHaveBeenNthCalledWith(1);
    expect(mockListOutgoing).toHaveBeenNthCalledWith(2, 'outgoing-cursor');
    expect(result.current.incoming.items).toEqual([incomingA, incomingB]);
    expect(result.current.outgoing.items).toEqual([outgoingA, outgoingB]);
    expect(result.current.incoming.hasNextPage).toBe(false);
    expect(result.current.outgoing.hasNextPage).toBe(false);
  });

  it('loads both first pages through the shared focus-refresh entry point', async () => {
    const incoming = incomingRequest('incoming-1');
    const outgoing = outgoingRequest('outgoing-1');
    mockListIncoming.mockResolvedValue({ items: [incoming], nextCursor: null });
    mockListOutgoing.mockResolvedValue({ items: [outgoing], nextCursor: null });
    const { result } = await renderHook(() => useFriendRequests());

    await act(async () => {
      await result.current.loadFirstPages('initial');
    });

    expect(result.current.incoming.items).toEqual([incoming]);
    expect(result.current.outgoing.items).toEqual([outgoing]);
    expect(mockListIncoming).toHaveBeenCalledTimes(1);
    expect(mockListOutgoing).toHaveBeenCalledTimes(1);
  });

  it('removes accepted, declined, and cancelled requests and publishes the accepted friendship', async () => {
    const accepted = incomingRequest('incoming-accept');
    const declined = incomingRequest('incoming-decline', otherUser);
    const cancelled = outgoingRequest('outgoing-cancel');
    mockListIncoming.mockResolvedValue({ items: [accepted, declined], nextCursor: null });
    mockListOutgoing.mockResolvedValue({ items: [cancelled], nextCursor: null });
    mockAcceptFriendRequest.mockResolvedValue({ friendship, friendRequestId: accepted.id });
    mockDeclineFriendRequest.mockResolvedValue(resolvedRequest(declined, 'DECLINED'));
    mockCancelFriendRequest.mockResolvedValue(resolvedRequest(cancelled, 'CANCELLED'));
    const events: FriendEvent[] = [];
    const unsubscribe = subscribeToFriendEvents(currentUser.id, (event) => events.push(event));
    const { result } = await renderHook(() => useFriendRequests());

    try {
      await act(async () => {
        await result.current.loadFirstPages('initial');
      });
      await act(async () => {
        await expect(result.current.performAction(accepted.id, 'accept')).resolves.toBe(true);
        await expect(result.current.performAction(declined.id, 'decline')).resolves.toBe(true);
        await expect(result.current.performAction(cancelled.id, 'cancel')).resolves.toBe(true);
      });
    } finally {
      unsubscribe();
    }

    expect(result.current.incoming.items).toEqual([]);
    expect(result.current.outgoing.items).toEqual([]);
    expect(mockAcceptFriendRequest).toHaveBeenCalledWith(accepted.id);
    expect(mockDeclineFriendRequest).toHaveBeenCalledWith(declined.id);
    expect(mockCancelFriendRequest).toHaveBeenCalledWith(cancelled.id);
    expect(events).toEqual([{ type: 'friendshipAdded', friendship }]);
  });

  it('locks duplicate actions by request ID while allowing different IDs concurrently', async () => {
    const firstRequest = incomingRequest('incoming-1');
    const secondRequest = incomingRequest('incoming-2', otherUser);
    const first = deferred<FriendRequest>();
    const second = deferred<FriendRequest>();
    mockDeclineFriendRequest.mockImplementation((requestId) => {
      return requestId === firstRequest.id ? first.promise : second.promise;
    });
    const { result } = await renderHook(() => useFriendRequests());
    let firstAction: Promise<boolean> = Promise.resolve(false);
    let duplicateAction: Promise<boolean> = Promise.resolve(true);
    let secondAction: Promise<boolean> = Promise.resolve(false);

    await act(async () => {
      firstAction = result.current.performAction(firstRequest.id, 'decline');
      duplicateAction = result.current.performAction(firstRequest.id, 'accept');
      secondAction = result.current.performAction(secondRequest.id, 'decline');
      await expect(duplicateAction).resolves.toBe(false);
    });

    expect(mockDeclineFriendRequest).toHaveBeenCalledTimes(2);
    expect(mockAcceptFriendRequest).not.toHaveBeenCalled();
    expect(result.current.pendingActions).toEqual(
      new Map([
        [firstRequest.id, 'decline'],
        [secondRequest.id, 'decline'],
      ]),
    );

    let outcomes: boolean[] = [];
    await act(async () => {
      first.resolve(resolvedRequest(firstRequest, 'DECLINED'));
      second.resolve(resolvedRequest(secondRequest, 'DECLINED'));
      outcomes = await Promise.all([firstAction, duplicateAction, secondAction]);
    });

    expect(outcomes).toEqual([true, false, true]);
    expect(result.current.pendingActions.size).toBe(0);
  });

  it('normalizes a mutation error and keeps the unresolved request visible', async () => {
    const request = incomingRequest('incoming-error');
    mockListIncoming.mockResolvedValue({ items: [request], nextCursor: null });
    mockAcceptFriendRequest.mockRejectedValue(
      axiosErrorWith(409, { detail: 'You have reached the friend limit.', error_code: 'FRIEND_LIMIT_REACHED' }),
    );
    const { result } = await renderHook(() => useFriendRequests());

    await act(async () => {
      await result.current.incoming.loadFirstPage('initial');
    });
    await act(async () => {
      await expect(result.current.performAction(request.id, 'accept')).resolves.toBe(false);
    });

    expect(result.current.incoming.items).toEqual([request]);
    expect(result.current.pendingActions.size).toBe(0);
    expect(result.current.mutationError).toMatchObject({
      message: 'You have reached the friend limit.',
      errorCode: 'FRIEND_LIMIT_REACHED',
      status: 409,
    });
  });

  it('keeps a resolved-request tombstone over a first-page response that started before the mutation', async () => {
    const request = incomingRequest('incoming-stale');
    const staleRefresh = deferred<{ items: FriendRequest[]; nextCursor: null }>();
    mockListIncoming
      .mockResolvedValueOnce({ items: [request], nextCursor: null })
      .mockReturnValueOnce(staleRefresh.promise);
    mockDeclineFriendRequest.mockResolvedValue(resolvedRequest(request, 'DECLINED'));
    const { result } = await renderHook(() => useFriendRequests());

    await act(async () => {
      await result.current.incoming.loadFirstPage('initial');
    });
    let refreshPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      refreshPromise = result.current.incoming.loadFirstPage('refresh');
    });
    await act(async () => {
      await result.current.performAction(request.id, 'decline');
    });
    expect(result.current.incoming.items).toEqual([]);

    await act(async () => {
      staleRefresh.resolve({ items: [request], nextCursor: null });
      await refreshPromise;
    });

    expect(result.current.incoming.items).toEqual([]);
    expect(result.current.incoming.status).toBe('ready');
  });

  it('lets a first-page request started after the mutation reconcile server truth', async () => {
    const request = incomingRequest('incoming-reconcile');
    mockListIncoming
      .mockResolvedValueOnce({ items: [request], nextCursor: null })
      .mockResolvedValueOnce({ items: [request], nextCursor: null });
    mockDeclineFriendRequest.mockResolvedValue(resolvedRequest(request, 'DECLINED'));
    const { result } = await renderHook(() => useFriendRequests());

    await act(async () => {
      await result.current.incoming.loadFirstPage('initial');
      await result.current.performAction(request.id, 'decline');
    });
    expect(result.current.incoming.items).toEqual([]);

    await act(async () => {
      await result.current.incoming.loadFirstPage('silent');
    });

    expect(result.current.incoming.items).toEqual([request]);
  });

  it('keeps the loaded page and cursor after a load-more error, then retries the same cursor', async () => {
    const firstRequest = incomingRequest('incoming-first');
    const secondRequest = incomingRequest('incoming-second', otherUser);
    mockListIncoming
      .mockResolvedValueOnce({ items: [firstRequest], nextCursor: 'cursor-retry' })
      .mockRejectedValueOnce(axiosErrorWith(503, { detail: 'Could not load more requests.' }))
      .mockResolvedValueOnce({ items: [firstRequest, secondRequest], nextCursor: null });
    const { result } = await renderHook(() => useFriendRequests());

    await act(async () => {
      await result.current.incoming.loadFirstPage('initial');
      await result.current.incoming.loadMore();
    });

    expect(result.current.incoming.items).toEqual([firstRequest]);
    expect(result.current.incoming.errorSource).toBe('loadMore');
    expect(result.current.incoming.error?.message).toBe('Could not load more requests.');
    expect(result.current.incoming.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.incoming.loadMore();
    });

    expect(mockListIncoming).toHaveBeenNthCalledWith(1);
    expect(mockListIncoming).toHaveBeenNthCalledWith(2, 'cursor-retry');
    expect(mockListIncoming).toHaveBeenNthCalledWith(3, 'cursor-retry');
    expect(result.current.incoming.items).toEqual([firstRequest, secondRequest]);
    expect(result.current.incoming.error).toBeNull();
    expect(result.current.incoming.errorSource).toBeNull();
    expect(result.current.incoming.hasNextPage).toBe(false);
  });
});
