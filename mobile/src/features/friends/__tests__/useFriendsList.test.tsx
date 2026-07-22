jest.mock('../api', () => ({
  listFriends: jest.fn(),
  removeFriend: jest.fn(),
}));

jest.mock('@/features/auth/session', () => ({
  useSession: () => ({ user: { id: 'owner-user' } }),
}));

// eslint-disable-next-line import/first
import { AxiosError, AxiosHeaders } from 'axios';
// eslint-disable-next-line import/first
import { act, renderHook, waitFor } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { listFriends, removeFriend } from '../api';
// eslint-disable-next-line import/first
import { publishFriendEvent } from '../friendEvents';
// eslint-disable-next-line import/first
import { useFriendsList } from '../hooks/useFriendsList';
// eslint-disable-next-line import/first
import type { Friend } from '../types';

const mockListFriends = listFriends as jest.MockedFunction<typeof listFriends>;
const mockRemoveFriend = removeFriend as jest.MockedFunction<typeof removeFriend>;

function makeFriend(id: string, displayName: string): Friend {
  return {
    friendship_id: id,
    user: {
      id: `user-${id}`,
      display_name: displayName,
      identify_tag: `${displayName.toLowerCase().replaceAll(' ', '')}#ABC123`,
      avatar_url: null,
    },
    created_at: '2026-07-22T00:00:00Z',
  };
}

const friendA = makeFriend('friend-a', 'Alice Example');
const friendB = makeFriend('friend-b', 'Bob Example');
const friendC = makeFriend('friend-c', 'Charlie Example');

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
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

describe('useFriendsList', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads, paginates with de-duplication, then replaces all pages on refresh', async () => {
    mockListFriends
      .mockResolvedValueOnce({ items: [friendA], nextCursor: 'cursor-1' })
      .mockResolvedValueOnce({ items: [friendA, friendB], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ items: [friendC], nextCursor: null });
    const { result, unmount } = await renderHook(() => useFriendsList());

    await act(async () => {
      await result.current.loadFirstPage('initial');
    });
    expect(result.current.items).toEqual([friendA]);
    expect(result.current.status).toBe('ready');
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.items).toEqual([friendA, friendB]);
    expect(mockListFriends).toHaveBeenNthCalledWith(2, 'cursor-1');

    await act(async () => {
      await result.current.loadFirstPage('refresh');
    });
    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.items).toEqual([friendC]);
    expect(result.current.refreshing).toBe(false);
    expect(result.current.hasNextPage).toBe(false);
    expect(mockListFriends).toHaveBeenCalledTimes(3);
    unmount();
  });

  it('retains the failed load-more cursor and retries it without dropping rendered items', async () => {
    mockListFriends
      .mockResolvedValueOnce({ items: [friendA], nextCursor: 'retry-cursor' })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ items: [friendB], nextCursor: null });
    const { result, unmount } = await renderHook(() => useFriendsList());

    await act(async () => {
      await result.current.loadFirstPage('initial');
    });
    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.items).toEqual([friendA]);
    expect(result.current.errorSource).toBe('loadMore');
    expect(result.current.error?.message).toBe('Something went wrong. Please try again.');
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(mockListFriends).toHaveBeenNthCalledWith(2, 'retry-cursor');
    expect(mockListFriends).toHaveBeenNthCalledWith(3, 'retry-cursor');
    expect(result.current.items).toEqual([friendA, friendB]);
    expect(result.current.error).toBeNull();
    expect(result.current.errorSource).toBeNull();
    expect(result.current.hasNextPage).toBe(false);
    unmount();
  });

  it('invalidates an older cursor page when a refresh starts a new list generation', async () => {
    const staleCursorPage = deferred<{ items: Friend[]; nextCursor: null }>();
    mockListFriends
      .mockResolvedValueOnce({ items: [friendA], nextCursor: 'cursor-1' })
      .mockReturnValueOnce(staleCursorPage.promise)
      .mockResolvedValueOnce({ items: [friendB], nextCursor: null });
    const { result, unmount } = await renderHook(() => useFriendsList());

    await act(async () => {
      await result.current.loadFirstPage('initial');
    });
    let staleLoadMore: Promise<void> = Promise.resolve();
    await act(async () => {
      staleLoadMore = result.current.loadMore();
    });
    await act(async () => {
      await result.current.loadFirstPage('refresh');
    });
    await act(async () => {
      staleCursorPage.resolve({ items: [friendC], nextCursor: null });
      await staleLoadMore;
    });

    expect(result.current.items).toEqual([friendB]);
    expect(result.current.loadingMore).toBe(false);
    unmount();
  });

  it('exposes retry instead of staying loading when an early silent focus request fails', async () => {
    const supersededInitialPage = deferred<{ items: Friend[]; nextCursor: null }>();
    mockListFriends
      .mockReturnValueOnce(supersededInitialPage.promise)
      .mockRejectedValueOnce(new Error('offline'));
    const { result, unmount } = await renderHook(() => useFriendsList());

    let initialRequest: Promise<void> = Promise.resolve();
    await act(async () => {
      initialRequest = result.current.loadFirstPage('initial');
    });
    await act(async () => {
      await result.current.loadFirstPage('silent');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.errorSource).toBe('initial');
    expect(result.current.error?.message).toBe('Something went wrong. Please try again.');

    await act(async () => {
      supersededInitialPage.resolve({ items: [friendA], nextCursor: null });
      await initialRequest;
    });
    expect(result.current.status).toBe('error');
    expect(result.current.items).toEqual([]);
    unmount();
  });

  it('keeps a friendshipAdded upsert over a first-page response that started earlier', async () => {
    const staleFirstPage = deferred<{ items: Friend[]; nextCursor: null }>();
    const locallyAcceptedFriend = {
      ...friendA,
      user: { ...friendA.user, display_name: 'Alice Accepted Locally' },
    };
    mockListFriends.mockReturnValueOnce(staleFirstPage.promise);
    const { result, unmount } = await renderHook(() => useFriendsList());

    let firstPageRequest: Promise<void> = Promise.resolve();
    await act(async () => {
      firstPageRequest = result.current.loadFirstPage('initial');
    });
    await act(async () => {
      publishFriendEvent('owner-user', { type: 'friendshipAdded', friendship: locallyAcceptedFriend });
    });
    expect(result.current.items).toEqual([locallyAcceptedFriend]);

    await act(async () => {
      staleFirstPage.resolve({ items: [friendA, friendB], nextCursor: null });
      await firstPageRequest;
    });

    expect(result.current.items).toEqual([locallyAcceptedFriend, friendB]);
    unmount();
  });

  it('keeps a removal tombstone over a first-page response that started earlier', async () => {
    const staleRefresh = deferred<{ items: Friend[]; nextCursor: null }>();
    mockListFriends
      .mockResolvedValueOnce({ items: [friendA, friendB], nextCursor: null })
      .mockReturnValueOnce(staleRefresh.promise);
    const { result, unmount } = await renderHook(() => useFriendsList());

    await act(async () => {
      await result.current.loadFirstPage('initial');
    });
    let refreshRequest: Promise<void> = Promise.resolve();
    await act(async () => {
      refreshRequest = result.current.loadFirstPage('silent');
    });
    await act(async () => {
      publishFriendEvent('owner-user', { type: 'friendshipRemoved', friendshipId: friendA.friendship_id });
    });
    expect(result.current.items).toEqual([friendB]);

    await act(async () => {
      staleRefresh.resolve({ items: [friendA, friendB], nextCursor: null });
      await refreshRequest;
    });

    expect(result.current.items).toEqual([friendB]);
    unmount();
  });

  it('lets a first-page request started after a mutation reconcile with server truth', async () => {
    mockListFriends
      .mockResolvedValueOnce({ items: [friendA], nextCursor: null })
      .mockResolvedValueOnce({ items: [friendA, friendB], nextCursor: null });
    const { result, unmount } = await renderHook(() => useFriendsList());

    await act(async () => {
      await result.current.loadFirstPage('initial');
    });
    await act(async () => {
      publishFriendEvent('owner-user', { type: 'friendshipRemoved', friendshipId: friendA.friendship_id });
    });
    expect(result.current.items).toEqual([]);

    await act(async () => {
      await result.current.loadFirstPage('silent');
    });

    expect(result.current.items).toEqual([friendA, friendB]);
    unmount();
  });

  it('ignores friendship events published for a different authenticated user', async () => {
    mockListFriends.mockResolvedValueOnce({ items: [friendA], nextCursor: null });
    const { result, unmount } = await renderHook(() => useFriendsList());

    await act(async () => {
      await result.current.loadFirstPage('initial');
      publishFriendEvent('another-user', { type: 'friendshipAdded', friendship: friendB });
      publishFriendEvent('another-user', { type: 'friendshipRemoved', friendshipId: friendA.friendship_id });
    });

    expect(result.current.items).toEqual([friendA]);
    unmount();
  });

  it('removes locally after backend success and clears the pending marker', async () => {
    mockListFriends.mockResolvedValueOnce({ items: [friendA], nextCursor: null });
    mockRemoveFriend.mockResolvedValueOnce(undefined);
    const { result, unmount } = await renderHook(() => useFriendsList());

    await act(async () => {
      await result.current.loadFirstPage('initial');
    });
    let didRemove = false;
    await act(async () => {
      didRemove = await result.current.removeFriend(friendA.friendship_id);
    });

    expect(didRemove).toBe(true);
    expect(mockRemoveFriend).toHaveBeenCalledWith(friendA.friendship_id);
    expect(result.current.items).toEqual([]);
    expect(result.current.removingIds.has(friendA.friendship_id)).toBe(false);
    expect(result.current.mutationError).toBeNull();
    unmount();
  });

  it('normalizes a backend removal error while preserving the friendship', async () => {
    mockListFriends.mockResolvedValueOnce({ items: [friendA], nextCursor: null });
    mockRemoveFriend.mockRejectedValueOnce(
      axiosErrorWith(404, {
        detail: 'Friendship not found.',
        error_code: 'FRIENDSHIP_NOT_FOUND',
      }),
    );
    const { result, unmount } = await renderHook(() => useFriendsList());

    await act(async () => {
      await result.current.loadFirstPage('initial');
    });
    let didRemove = true;
    await act(async () => {
      didRemove = await result.current.removeFriend(friendA.friendship_id);
    });

    expect(didRemove).toBe(false);
    expect(result.current.items).toEqual([friendA]);
    expect(result.current.removingIds.has(friendA.friendship_id)).toBe(false);
    expect(result.current.mutationError).toMatchObject({
      message: 'Friendship not found.',
      errorCode: 'FRIENDSHIP_NOT_FOUND',
      status: 404,
    });

    await act(async () => {
      result.current.clearMutationError();
    });
    expect(result.current.mutationError).toBeNull();
    unmount();
  });

  it('uses a synchronous lock to block duplicate removals before React state commits', async () => {
    const pendingRemoval = deferred<void>();
    mockListFriends.mockResolvedValueOnce({ items: [friendA], nextCursor: null });
    mockRemoveFriend.mockReturnValueOnce(pendingRemoval.promise);
    const { result, unmount } = await renderHook(() => useFriendsList());

    await act(async () => {
      await result.current.loadFirstPage('initial');
    });

    let firstRemoval: Promise<boolean> = Promise.resolve(false);
    let duplicateResult = true;
    await act(async () => {
      firstRemoval = result.current.removeFriend(friendA.friendship_id);
      duplicateResult = await result.current.removeFriend(friendA.friendship_id);
    });

    expect(duplicateResult).toBe(false);
    expect(mockRemoveFriend).toHaveBeenCalledTimes(1);
    expect(result.current.removingIds.has(friendA.friendship_id)).toBe(true);

    let firstResult = false;
    await act(async () => {
      pendingRemoval.resolve();
      firstResult = await firstRemoval;
    });

    expect(firstResult).toBe(true);
    await waitFor(() => {
      expect(result.current.removingIds.has(friendA.friendship_id)).toBe(false);
    });
    expect(result.current.items).toEqual([]);
    unmount();
  });
});
