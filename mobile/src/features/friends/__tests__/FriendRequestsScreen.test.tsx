const mockUseFocusEffect = jest.fn();
const mockUseFriendRequests = jest.fn();
const mockFlatListProps = jest.fn();

jest.mock('react-native/Libraries/Lists/FlatList', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  interface MockItem {
    id: string;
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
            React.createElement(React.Fragment, { key: item.id }, props.renderItem({ item })),
          )
        : props.ListEmptyComponent,
      props.ListFooterComponent,
    );
  }

  return { __esModule: true, default: MockFlatList };
});

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => mockUseFocusEffect(effect),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@/shared/ui/LoadingScreen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { LoadingScreen: () => React.createElement(View, { testID: 'requests-loading' }) };
});
jest.mock('../hooks/useFriendRequests', () => ({ useFriendRequests: () => mockUseFriendRequests() }));

// eslint-disable-next-line import/first
import { fireEvent, render, screen } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { FriendRequestsScreen } from '../screens/FriendRequestsScreen';
// eslint-disable-next-line import/first
import type { useFriendRequests } from '../hooks/useFriendRequests';
// eslint-disable-next-line import/first
import type { FriendRequest } from '../types';

type FriendRequestsState = ReturnType<typeof useFriendRequests>;
type RequestListState = FriendRequestsState['incoming'];

const incomingRequest: FriendRequest = {
  id: 'incoming-1',
  sender: {
    id: 'alice-id',
    display_name: 'Alice Sender',
    identify_tag: 'alice#ABC123',
    avatar_url: null,
  },
  receiver: {
    id: 'current-id',
    display_name: 'Current User',
    identify_tag: 'current#CUR123',
    avatar_url: null,
  },
  status: 'PENDING',
  resolved_at: null,
  created_at: '2026-07-20T10:00:00Z',
};

const outgoingRequest: FriendRequest = {
  id: 'outgoing-1',
  sender: incomingRequest.receiver,
  receiver: {
    id: 'bob-id',
    display_name: 'Bob Receiver',
    identify_tag: 'bob#DEF456',
    avatar_url: null,
  },
  status: 'PENDING',
  resolved_at: null,
  created_at: '2026-07-21T10:00:00Z',
};

function createListState(overrides: Partial<RequestListState> = {}): RequestListState {
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
    ...overrides,
  };
}

function createState(overrides: Partial<FriendRequestsState> = {}): FriendRequestsState {
  return {
    incoming: createListState(),
    outgoing: createListState(),
    pendingActions: new Map(),
    mutationError: null,
    performAction: jest.fn(async (_requestId: string, _action: 'accept' | 'decline' | 'cancel') => true),
    loadFirstPages: jest.fn(async (_mode: 'initial' | 'refresh' | 'silent') => {}),
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
    throw new Error('Expected FriendRequestsScreen to render a FlatList.');
  }
  return props;
}

describe('FriendRequestsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFriendRequests.mockReturnValue(createState());
  });

  it('loads both request lists initially and silently on later focus', async () => {
    const loadFirstPages = jest.fn(async (_mode: 'initial' | 'refresh' | 'silent') => {});
    mockUseFriendRequests.mockReturnValue(createState({ loadFirstPages }));
    await render(<FriendRequestsScreen />);

    const focusCallback = mockUseFocusEffect.mock.calls.at(0)?.[0];
    expect(focusCallback).toBeDefined();
    focusCallback?.();
    focusCallback?.();

    expect(loadFirstPages).toHaveBeenNthCalledWith(1, 'initial');
    expect(loadFirstPages).toHaveBeenNthCalledWith(2, 'silent');
  });

  it('shows the current tab loading state independently', async () => {
    mockUseFriendRequests.mockReturnValue(
      createState({
        incoming: createListState({ items: [incomingRequest] }),
        outgoing: createListState({ status: 'loading' }),
      }),
    );
    await render(<FriendRequestsScreen />);

    expect(screen.getByText('Alice Sender')).toBeTruthy();
    await fireEvent.press(screen.getByText('Outgoing'));
    expect(screen.getByTestId('requests-loading')).toBeTruthy();
  });

  it('switches between incoming sender and outgoing receiver without inventing counts', async () => {
    mockUseFriendRequests.mockReturnValue(
      createState({
        incoming: createListState({ items: [incomingRequest] }),
        outgoing: createListState({ items: [outgoingRequest] }),
      }),
    );
    await render(<FriendRequestsScreen />);

    expect(screen.getByText('Alice Sender')).toBeTruthy();
    expect(screen.queryByText('Bob Receiver')).toBeNull();
    expect(screen.getByRole('button', { name: 'Incoming requests' }).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByRole('button', { name: 'Outgoing requests' }).props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByText('Incoming')).toBeTruthy();
    expect(screen.queryByText(/Incoming \(/)).toBeNull();
    expect(screen.queryByText(/Outgoing \(/)).toBeNull();

    await fireEvent.press(screen.getByText('Outgoing'));

    expect(screen.getByRole('button', { name: 'Outgoing requests' }).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByText('Bob Receiver')).toBeTruthy();
    expect(screen.queryByText('Alice Sender')).toBeNull();
  });

  it('shows the active tab initial error and retries only that tab', async () => {
    const outgoingLoadFirstPage = jest.fn(async (_mode: 'initial' | 'refresh' | 'silent') => {});
    const incomingLoadFirstPage = jest.fn(async (_mode: 'initial' | 'refresh' | 'silent') => {});
    mockUseFriendRequests.mockReturnValue(
      createState({
        incoming: createListState({ items: [incomingRequest], loadFirstPage: incomingLoadFirstPage }),
        outgoing: createListState({
          status: 'error',
          error: { kind: 'network', message: 'Outgoing requests failed.' },
          errorSource: 'initial',
          loadFirstPage: outgoingLoadFirstPage,
        }),
      }),
    );
    await render(<FriendRequestsScreen />);

    await fireEvent.press(screen.getByText('Outgoing'));
    expect(screen.getByText('Could not load requests')).toBeTruthy();
    expect(screen.getByText('Outgoing requests failed.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));

    expect(outgoingLoadFirstPage).toHaveBeenCalledWith('initial');
    expect(incomingLoadFirstPage).not.toHaveBeenCalled();
  });

  it('dispatches incoming and outgoing actions with their request IDs', async () => {
    const performAction = jest.fn(async (_requestId: string, _action: 'accept' | 'decline' | 'cancel') => true);
    mockUseFriendRequests.mockReturnValue(
      createState({
        incoming: createListState({ items: [incomingRequest] }),
        outgoing: createListState({ items: [outgoingRequest] }),
        performAction,
      }),
    );
    await render(<FriendRequestsScreen />);

    await fireEvent.press(screen.getByLabelText('Accept Alice Sender'));
    await fireEvent.press(screen.getByLabelText('Decline Alice Sender'));
    await fireEvent.press(screen.getByText('Outgoing'));
    await fireEvent.press(screen.getByLabelText('Cancel request to Bob Receiver'));

    expect(performAction).toHaveBeenNthCalledWith(1, 'incoming-1', 'accept');
    expect(performAction).toHaveBeenNthCalledWith(2, 'incoming-1', 'decline');
    expect(performAction).toHaveBeenNthCalledWith(3, 'outgoing-1', 'cancel');
  });

  it('retains the row, displays mutation errors, and disables duplicate actions', async () => {
    mockUseFriendRequests.mockReturnValue(
      createState({
        incoming: createListState({ items: [incomingRequest] }),
        pendingActions: new Map([['incoming-1', 'accept']]),
        mutationError: { kind: 'message', message: 'Request is no longer pending.', errorCode: 'INVALID_REQUEST_STATE' },
      }),
    );
    await render(<FriendRequestsScreen />);

    expect(screen.getByText('Alice Sender')).toBeTruthy();
    expect(screen.getByText('Request is no longer pending.')).toBeTruthy();
    expect(screen.getByLabelText('Accept Alice Sender').props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    expect(screen.getByLabelText('Decline Alice Sender').props.accessibilityState).toEqual({
      disabled: true,
      busy: false,
    });
    expect(screen.queryByLabelText('Retry refreshing incoming requests')).toBeNull();
  });

  it('delegates pull-to-refresh and pagination to the active tab', async () => {
    const incomingLoadFirstPage = jest.fn(async (_mode: 'initial' | 'refresh' | 'silent') => {});
    const incomingLoadMore = jest.fn(async () => {});
    const outgoingLoadFirstPage = jest.fn(async (_mode: 'initial' | 'refresh' | 'silent') => {});
    const outgoingLoadMore = jest.fn(async () => {});
    mockUseFriendRequests.mockReturnValue(
      createState({
        incoming: createListState({
          items: [incomingRequest],
          refreshing: true,
          loadFirstPage: incomingLoadFirstPage,
          loadMore: incomingLoadMore,
        }),
        outgoing: createListState({
          items: [outgoingRequest],
          loadFirstPage: outgoingLoadFirstPage,
          loadMore: outgoingLoadMore,
        }),
      }),
    );
    await render(<FriendRequestsScreen />);

    const incomingProps = latestListProps();
    await incomingProps.onRefresh();
    await incomingProps.onEndReached();
    expect(incomingProps.refreshing).toBe(true);

    await fireEvent.press(screen.getByText('Outgoing'));
    const outgoingProps = latestListProps();
    await outgoingProps.onRefresh();
    await outgoingProps.onEndReached();

    expect(incomingLoadFirstPage).toHaveBeenCalledWith('refresh');
    expect(incomingLoadMore).toHaveBeenCalledTimes(1);
    expect(outgoingLoadFirstPage).toHaveBeenCalledWith('refresh');
    expect(outgoingLoadMore).toHaveBeenCalledTimes(1);
  });

  it('retries load-more errors through each tab cursor function', async () => {
    const incomingLoadFirstPage = jest.fn(async (_mode: 'initial' | 'refresh' | 'silent') => {});
    const incomingLoadMore = jest.fn(async () => {});
    const outgoingLoadFirstPage = jest.fn(async (_mode: 'initial' | 'refresh' | 'silent') => {});
    const outgoingLoadMore = jest.fn(async () => {});
    mockUseFriendRequests.mockReturnValue(
      createState({
        incoming: createListState({
          items: [incomingRequest],
          error: { kind: 'network', message: 'More incoming failed.' },
          errorSource: 'loadMore',
          loadFirstPage: incomingLoadFirstPage,
          loadMore: incomingLoadMore,
        }),
        outgoing: createListState({
          items: [outgoingRequest],
          error: { kind: 'network', message: 'More outgoing failed.' },
          errorSource: 'loadMore',
          loadFirstPage: outgoingLoadFirstPage,
          loadMore: outgoingLoadMore,
        }),
      }),
    );
    await render(<FriendRequestsScreen />);

    await latestListProps().onEndReached();
    expect(incomingLoadMore).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Retry loading more incoming requests'));
    await fireEvent.press(screen.getByText('Outgoing'));
    await latestListProps().onEndReached();
    expect(outgoingLoadMore).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Retry loading more outgoing requests'));

    expect(incomingLoadMore).toHaveBeenCalledTimes(1);
    expect(outgoingLoadMore).toHaveBeenCalledTimes(1);
    expect(incomingLoadFirstPage).not.toHaveBeenCalled();
    expect(outgoingLoadFirstPage).not.toHaveBeenCalled();
  });

  it('keeps each tab data during refresh errors and retries that first page', async () => {
    const incomingLoadFirstPage = jest.fn(async (_mode: 'initial' | 'refresh' | 'silent') => {});
    const outgoingLoadFirstPage = jest.fn(async (_mode: 'initial' | 'refresh' | 'silent') => {});
    mockUseFriendRequests.mockReturnValue(
      createState({
        incoming: createListState({
          items: [incomingRequest],
          error: { kind: 'network', message: 'Incoming refresh failed.' },
          errorSource: 'refresh',
          loadFirstPage: incomingLoadFirstPage,
        }),
        outgoing: createListState({
          items: [outgoingRequest],
          error: { kind: 'network', message: 'Outgoing refresh failed.' },
          errorSource: 'refresh',
          loadFirstPage: outgoingLoadFirstPage,
        }),
      }),
    );
    await render(<FriendRequestsScreen />);

    expect(screen.getByText('Alice Sender')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Retry refreshing incoming requests'));
    await fireEvent.press(screen.getByText('Outgoing'));
    expect(screen.getByText('Bob Receiver')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Retry refreshing outgoing requests'));

    expect(incomingLoadFirstPage).toHaveBeenCalledWith('refresh');
    expect(outgoingLoadFirstPage).toHaveBeenCalledWith('refresh');
  });

  it('shows distinct empty messages without total-count placeholders', async () => {
    await render(<FriendRequestsScreen />);

    expect(screen.getByText('No incoming requests')).toBeTruthy();
    await fireEvent.press(screen.getByText('Outgoing'));
    expect(screen.getByText('No outgoing requests')).toBeTruthy();
    expect(screen.queryByText(/\d+ requests/)).toBeNull();
  });
});
