const mockUseFocusEffect = jest.fn();

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => (() => void) | void) => mockUseFocusEffect(effect),
}));

jest.mock('../api', () => ({
  searchFriendUser: jest.fn(),
  sendFriendRequest: jest.fn(),
}));

// eslint-disable-next-line import/first
import { AxiosError, AxiosHeaders } from 'axios';
// eslint-disable-next-line import/first
import { act, renderHook } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { searchFriendUser, sendFriendRequest } from '../api';
// eslint-disable-next-line import/first
import { useFriendSearch } from '../hooks/useFriendSearch';
// eslint-disable-next-line import/first
import type { FriendRequest, FriendUser } from '../types';

const mockSearchFriendUser = searchFriendUser as jest.MockedFunction<typeof searchFriendUser>;
const mockSendFriendRequest = sendFriendRequest as jest.MockedFunction<typeof sendFriendRequest>;

const foundUser: FriendUser = {
  id: 'user-2',
  display_name: 'Minh Anh',
  identify_tag: 'minhanh#AB12',
  avatar_url: null,
};

const sender: FriendUser = {
  id: 'user-1',
  display_name: 'Quang Minh',
  identify_tag: 'quangminh#CD34',
  avatar_url: null,
};

const createdRequest: FriendRequest = {
  id: 'request-1',
  sender,
  receiver: foundUser,
  status: 'PENDING',
  resolved_at: null,
  created_at: '2026-07-22T00:00:00Z',
};

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

async function setQuery(result: { current: ReturnType<typeof useFriendSearch> }, query: string) {
  await act(async () => {
    result.current.setQuery(query);
  });
}

async function runSearch(result: { current: ReturnType<typeof useFriendSearch> }) {
  await act(async () => {
    await result.current.search();
  });
}

describe('useFriendSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('finds an exact identify tag and resets stale results when the query changes', async () => {
    mockSearchFriendUser.mockResolvedValue(foundUser);
    const { result } = await renderHook(() => useFriendSearch());

    await setQuery(result, '  minhanh#AB12  ');
    await runSearch(result);

    expect(mockSearchFriendUser).toHaveBeenCalledWith('minhanh#AB12', expect.any(AbortSignal));
    expect(result.current.user).toEqual(foundUser);
    expect(result.current.searchStatus).toBe('found');

    await setQuery(result, 'someone#ZZ99');

    expect(result.current.user).toBeNull();
    expect(result.current.searchStatus).toBe('idle');
  });

  it('uses the same neutral not-found state for a null search result', async () => {
    mockSearchFriendUser.mockResolvedValue(null);
    const { result } = await renderHook(() => useFriendSearch());

    await setQuery(result, 'unknown#NONE');
    await runSearch(result);

    expect(result.current.user).toBeNull();
    expect(result.current.searchStatus).toBe('notFound');
    expect(result.current.searchError).toBeNull();
  });

  it('normalizes malformed-query errors from the backend', async () => {
    mockSearchFriendUser.mockRejectedValue(
      axiosErrorWith(400, { detail: 'Enter an identify tag in name#CODE format.', error_code: 'INVALID_SEARCH_QUERY' }),
    );
    const { result } = await renderHook(() => useFriendSearch());

    await setQuery(result, 'malformed');
    await runSearch(result);

    expect(result.current.searchStatus).toBe('error');
    expect(result.current.searchError).toMatchObject({
      message: 'Enter an identify tag in name#CODE format.',
      errorCode: 'INVALID_SEARCH_QUERY',
      status: 400,
    });
  });

  it('keeps the latest search result when an older request resolves last', async () => {
    const first = deferred<FriendUser | null>();
    const second = deferred<FriendUser | null>();
    mockSearchFriendUser.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = await renderHook(() => useFriendSearch());

    await setQuery(result, 'first#AA11');
    let firstSearch: Promise<void> = Promise.resolve();
    await act(async () => {
      firstSearch = result.current.search();
    });
    const firstSignal = mockSearchFriendUser.mock.calls[0]?.[1];

    await setQuery(result, 'second#BB22');
    expect(firstSignal?.aborted).toBe(true);
    let secondSearch: Promise<void> = Promise.resolve();
    await act(async () => {
      secondSearch = result.current.search();
    });

    const newestUser = { ...foundUser, id: 'user-newest', identify_tag: 'second#BB22' };
    await act(async () => {
      second.resolve(newestUser);
      await secondSearch;
    });
    await act(async () => {
      first.resolve({ ...foundUser, id: 'user-stale', identify_tag: 'first#AA11' });
      await firstSearch;
    });

    expect(result.current.user).toEqual(newestUser);
    expect(result.current.searchStatus).toBe('found');
  });

  it('aborts and ignores a pending search when the screen loses focus', async () => {
    const pending = deferred<FriendUser | null>();
    mockSearchFriendUser.mockReturnValue(pending.promise);
    const { result } = await renderHook(() => useFriendSearch());
    const focusCallback = mockUseFocusEffect.mock.calls.at(-1)?.[0] as (() => (() => void) | void) | undefined;
    const cleanup = focusCallback?.();

    await setQuery(result, 'minhanh#AB12');
    let searchPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      searchPromise = result.current.search();
    });
    const signal = mockSearchFriendUser.mock.calls[0]?.[1];

    cleanup?.();
    expect(signal?.aborted).toBe(true);

    await act(async () => {
      pending.resolve(foundUser);
      await searchPromise;
    });
    expect(result.current.user).toBeNull();
  });

  it('sends the server-returned identify tag and stores the created request', async () => {
    mockSearchFriendUser.mockResolvedValue(foundUser);
    mockSendFriendRequest.mockResolvedValue(createdRequest);
    const { result } = await renderHook(() => useFriendSearch());

    await setQuery(result, '  MINHANH#ab12  ');
    await runSearch(result);
    await act(async () => {
      await result.current.sendRequest();
    });

    expect(mockSendFriendRequest).toHaveBeenCalledWith(foundUser.identify_tag);
    expect(result.current.friendRequest).toEqual(createdRequest);
    expect(result.current.sendStatus).toBe('sent');
  });

  it('blocks duplicate sends synchronously while the mutation is pending', async () => {
    const pending = deferred<FriendRequest>();
    mockSearchFriendUser.mockResolvedValue(foundUser);
    mockSendFriendRequest.mockReturnValue(pending.promise);
    const { result } = await renderHook(() => useFriendSearch());

    await setQuery(result, foundUser.identify_tag);
    await runSearch(result);
    let firstSend: Promise<void> = Promise.resolve();
    await act(async () => {
      firstSend = result.current.sendRequest();
      await result.current.sendRequest();
    });

    expect(mockSendFriendRequest).toHaveBeenCalledTimes(1);
    expect(result.current.sendStatus).toBe('sending');

    await act(async () => {
      pending.resolve(createdRequest);
      await firstSend;
    });
    expect(result.current.sendStatus).toBe('sent');
  });

  it('keeps a pending send locked across blur and commits its result after refocus', async () => {
    const pending = deferred<FriendRequest>();
    mockSearchFriendUser.mockResolvedValue(foundUser);
    mockSendFriendRequest.mockReturnValue(pending.promise);
    const { result } = await renderHook(() => useFriendSearch());
    const focusCallback = mockUseFocusEffect.mock.calls.at(-1)?.[0] as (() => (() => void) | void) | undefined;
    const cleanup = focusCallback?.();

    await setQuery(result, foundUser.identify_tag);
    await runSearch(result);
    let sendPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      sendPromise = result.current.sendRequest();
    });
    expect(result.current.sendStatus).toBe('sending');

    cleanup?.();
    await act(async () => {
      focusCallback?.();
    });
    expect(result.current.sendStatus).toBe('sending');
    await act(async () => {
      await result.current.sendRequest();
    });
    expect(mockSendFriendRequest).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(createdRequest);
      await sendPromise;
    });
    expect(result.current.friendRequest).toEqual(createdRequest);
    expect(result.current.sendStatus).toBe('sent');
  });

  it.each([
    ['SELF_REQUEST', 'You cannot send a friend request to yourself.'],
    ['USER_NOT_FOUND', 'User not found.'],
    ['DUPLICATE_PENDING', 'A friend request is already pending.'],
    ['ALREADY_FRIENDS', 'You are already friends.'],
    ['FRIEND_LIMIT_REACHED', 'One of you has reached the friend limit.'],
  ])('normalizes the %s business error without replacing its message', async (errorCode, message) => {
    mockSearchFriendUser.mockResolvedValue(foundUser);
    mockSendFriendRequest.mockRejectedValue(axiosErrorWith(409, { detail: message, error_code: errorCode }));
    const { result } = await renderHook(() => useFriendSearch());

    await setQuery(result, foundUser.identify_tag);
    await runSearch(result);
    await act(async () => {
      await result.current.sendRequest();
    });

    expect(result.current.sendStatus).toBe('idle');
    expect(result.current.sendError).toMatchObject({ message, errorCode, status: 409 });
  });
});
