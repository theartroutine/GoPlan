import { Alert } from 'react-native';

const mockRouter = { push: jest.fn() };
const mockUseFocusEffect = jest.fn();
const mockUseFriendsList = jest.fn();
const mockFlatListProps = jest.fn();

jest.mock('react-native/Libraries/Lists/FlatList', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  interface MockItem {
    friendship_id: string;
  }

  interface MockFlatListProps {
    data: MockItem[];
    renderItem: (info: { item: MockItem }) => import('react').ReactNode;
    onRefresh: () => void;
    onEndReached: () => void;
    refreshing: boolean;
    ListEmptyComponent: import('react').ReactNode;
    ListFooterComponent: import('react').ReactNode;
  }

  function MockFlatList(props: MockFlatListProps) {
    mockFlatListProps(props);
    return React.createElement(
      View,
      null,
      props.data.length > 0
        ? props.data.map((item) =>
            React.createElement(React.Fragment, { key: item.friendship_id }, props.renderItem({ item })),
          )
        : props.ListEmptyComponent,
      props.ListFooterComponent,
    );
  }

  return { __esModule: true, default: MockFlatList };
});

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => mockUseFocusEffect(effect),
  useRouter: () => mockRouter,
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@/shared/ui/LoadingScreen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { LoadingScreen: () => React.createElement(View, { testID: 'friends-loading' }) };
});
jest.mock('../hooks/useFriendsList', () => ({ useFriendsList: () => mockUseFriendsList() }));

// eslint-disable-next-line import/first
import { act, fireEvent, render, screen } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { FriendsScreen } from '../screens/FriendsScreen';
// eslint-disable-next-line import/first
import type { useFriendsList } from '../hooks/useFriendsList';
// eslint-disable-next-line import/first
import type { Friend } from '../types';

type FriendsListState = ReturnType<typeof useFriendsList>;

const friend: Friend = {
  friendship_id: 'friendship-1',
  user: {
    id: 'user-1',
    display_name: 'Alice Nguyen',
    identify_tag: 'alice#ABC123',
    avatar_url: null,
  },
  created_at: '2026-07-20T10:00:00Z',
};

function createState(overrides: Partial<FriendsListState> = {}): FriendsListState {
  return {
    items: [],
    status: 'ready',
    error: null,
    errorSource: null,
    refreshing: false,
    loadingMore: false,
    hasNextPage: false,
    loadFirstPage: jest.fn(async (_mode: 'initial' | 'refresh' | 'silent') => {}),
    loadMore: jest.fn(async () => {}),
    upsertLocalItem: jest.fn(),
    removeLocalItem: jest.fn(),
    removingIds: new Set<string>(),
    mutationError: null,
    removeFriend: jest.fn(async (_friendshipId: string) => true),
    clearMutationError: jest.fn(),
    ...overrides,
  };
}

function latestListProps(): {
  onRefresh: () => void;
  onEndReached: () => void;
  refreshing: boolean;
} {
  const props = mockFlatListProps.mock.calls.at(-1)?.[0];
  if (!props) {
    throw new Error('Expected FriendsScreen to render a FlatList.');
  }
  return props;
}

describe('FriendsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFriendsList.mockReturnValue(createState());
  });

  afterEach(() => jest.restoreAllMocks());

  it('shows a full loading state before the first page resolves', async () => {
    mockUseFriendsList.mockReturnValue(createState({ status: 'loading' }));

    await render(<FriendsScreen />);

    expect(screen.getByTestId('friends-loading')).toBeTruthy();
    expect(screen.queryByText('No friends yet')).toBeNull();
  });

  it('shows the empty state and routes to Add Friend and Requests', async () => {
    await render(<FriendsScreen />);

    expect(screen.getByText('No friends yet')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Add Friend'));
    await fireEvent.press(screen.getByLabelText('Requests'));
    await fireEvent.press(screen.getByText('Add your first friend'));

    expect(mockRouter.push).toHaveBeenNthCalledWith(1, '/friends/add');
    expect(mockRouter.push).toHaveBeenNthCalledWith(2, '/friends/requests');
    expect(mockRouter.push).toHaveBeenNthCalledWith(3, '/friends/add');
  });

  it('renders a friend and refreshes initially, then silently on later focus', async () => {
    const loadFirstPage = jest.fn(async (_mode: 'initial' | 'refresh' | 'silent') => {});
    mockUseFriendsList.mockReturnValue(createState({ items: [friend], loadFirstPage }));
    await render(<FriendsScreen />);

    expect(screen.getByText('Alice Nguyen')).toBeTruthy();
    expect(screen.getByText('alice#ABC123')).toBeTruthy();
    const focusCallback = mockUseFocusEffect.mock.calls.at(0)?.[0];
    expect(focusCallback).toBeDefined();

    focusCallback?.();
    focusCallback?.();

    expect(loadFirstPage).toHaveBeenNthCalledWith(1, 'initial');
    expect(loadFirstPage).toHaveBeenNthCalledWith(2, 'silent');
  });

  it('shows an initial error and retries the first page', async () => {
    const loadFirstPage = jest.fn(async (_mode: 'initial' | 'refresh' | 'silent') => {});
    mockUseFriendsList.mockReturnValue(
      createState({
        status: 'error',
        error: { kind: 'network', message: 'Cannot reach the server. Check your connection.' },
        errorSource: 'initial',
        loadFirstPage,
      }),
    );

    await render(<FriendsScreen />);
    await fireEvent.press(screen.getByText('Try again'));

    expect(screen.getByText('Could not load friends')).toBeTruthy();
    expect(loadFirstPage).toHaveBeenCalledWith('initial');
  });

  it('delegates pull-to-refresh and end-reached pagination', async () => {
    const loadFirstPage = jest.fn(async (_mode: 'initial' | 'refresh' | 'silent') => {});
    const loadMore = jest.fn(async () => {});
    mockUseFriendsList.mockReturnValue(
      createState({ items: [friend], refreshing: true, loadFirstPage, loadMore }),
    );
    await render(<FriendsScreen />);

    const listProps = latestListProps();
    await listProps.onRefresh();
    await listProps.onEndReached();

    expect(listProps.refreshing).toBe(true);
    expect(loadFirstPage).toHaveBeenCalledWith('refresh');
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('retries a load-more error with the same pagination function', async () => {
    const loadFirstPage = jest.fn(async (_mode: 'initial' | 'refresh' | 'silent') => {});
    const loadMore = jest.fn(async () => {});
    mockUseFriendsList.mockReturnValue(
      createState({
        items: [friend],
        error: { kind: 'network', message: 'Could not load another page.' },
        errorSource: 'loadMore',
        loadFirstPage,
        loadMore,
      }),
    );
    await render(<FriendsScreen />);

    await latestListProps().onEndReached();
    expect(loadMore).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Retry loading more friends'));

    expect(screen.getByText('Alice Nguyen')).toBeTruthy();
    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(loadFirstPage).not.toHaveBeenCalled();
  });

  it('keeps the list during a refresh error and retries the first page as refresh', async () => {
    const loadFirstPage = jest.fn(async (_mode: 'initial' | 'refresh' | 'silent') => {});
    mockUseFriendsList.mockReturnValue(
      createState({
        items: [friend],
        error: { kind: 'network', message: 'Refresh failed.' },
        errorSource: 'refresh',
        loadFirstPage,
      }),
    );
    await render(<FriendsScreen />);

    expect(screen.getByText('Alice Nguyen')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Retry refreshing friends'));
    expect(loadFirstPage).toHaveBeenCalledWith('refresh');
  });

  it('only removes after the destructive native confirmation action', async () => {
    const removeFriend = jest.fn(async (_friendshipId: string) => true);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockUseFriendsList.mockReturnValue(createState({ items: [friend], removeFriend }));
    await render(<FriendsScreen />);

    await fireEvent.press(screen.getByLabelText('Remove Alice Nguyen'));
    expect(removeFriend).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Remove friend',
      'Remove Alice Nguyen from your friends?',
      expect.any(Array),
    );

    const buttons = alertSpy.mock.calls[0]?.[2];
    const destructive = buttons?.find((button) => button.text === 'Remove');
    expect(destructive?.style).toBe('destructive');
    await act(async () => {
      destructive?.onPress?.();
    });
    expect(removeFriend).toHaveBeenCalledWith('friendship-1');
  });

  it('keeps rendered data, displays mutation errors, and disables duplicate removal UI', async () => {
    mockUseFriendsList.mockReturnValue(
      createState({
        items: [friend],
        removingIds: new Set(['friendship-1']),
        mutationError: { kind: 'message', message: 'Friendship not found.', errorCode: 'FRIENDSHIP_NOT_FOUND' },
      }),
    );
    await render(<FriendsScreen />);

    expect(screen.getByText('Alice Nguyen')).toBeTruthy();
    expect(screen.getByText('Friendship not found.')).toBeTruthy();
    expect(screen.queryByLabelText('Retry refreshing friends')).toBeNull();
    expect(screen.getByLabelText('Remove Alice Nguyen').props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
  });
});
