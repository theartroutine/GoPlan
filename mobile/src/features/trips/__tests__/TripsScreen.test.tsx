const mockRouter = { push: jest.fn() };
const mockUseFocusEffect = jest.fn();
const mockUseTripsList = jest.fn();
const mockFlatListProps = jest.fn();

jest.mock('react-native/Libraries/Lists/FlatList', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  function MockFlatList({
    data,
    renderItem,
    onRefresh,
    onEndReached,
    refreshing,
    ListEmptyComponent,
  }: {
    data: { id: string }[];
    renderItem: (info: { item: { id: string } }) => import('react').ReactNode;
    onRefresh: () => void;
    onEndReached: () => void;
    refreshing: boolean;
    ListEmptyComponent: import('react').ReactNode;
  }) {
    mockFlatListProps({ onRefresh, onEndReached, refreshing });
    return React.createElement(
      'RCTView',
      null,
      data.length > 0
        ? data.map((item) => React.createElement(React.Fragment, { key: item.id }, renderItem({ item })))
        : ListEmptyComponent,
    );
  }

  return { __esModule: true, default: MockFlatList };
});

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => mockUseFocusEffect(effect),
  useRouter: () => mockRouter,
}));

jest.mock('../hooks/useTripsList', () => ({
  useTripsList: () => mockUseTripsList(),
}));

// eslint-disable-next-line import/first
import { fireEvent, render, screen } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { TripsScreen } from '../screens/TripsScreen';
// eslint-disable-next-line import/first
import type { useTripsList } from '../hooks/useTripsList';

type TripsListState = ReturnType<typeof useTripsList>;

const trip = {
  id: 'trip-1',
  name: 'Da Lat weekend',
  destination: 'Da Lat',
  cover_image_url: '',
  start_date: '2026-08-01',
  end_date: '2026-08-03',
  status: 'PLANNING' as const,
  currency_code: 'VND',
  budget_estimate: null,
  member_count: 2,
  my_role: 'CAPTAIN' as const,
};

function createState(overrides: Partial<TripsListState> = {}): TripsListState {
  return {
    items: [],
    status: 'ready',
    error: null,
    refreshing: false,
    loadingMore: false,
    loadFirstPage: jest.fn(async (_mode: 'initial' | 'refresh' | 'silent') => {}),
    loadMore: jest.fn(async () => {}),
    ...overrides,
  };
}

describe('TripsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading before the initial result is available', async () => {
    mockUseTripsList.mockReturnValue(createState({ status: 'loading' }));

    await render(<TripsScreen />);

    expect(screen.queryByText('No trips yet')).toBeNull();
    expect(mockUseFocusEffect).toHaveBeenCalledTimes(1);
  });

  it('renders a trip card, loads on focus, and opens its detail route', async () => {
    const loadFirstPage = jest.fn(async (_mode: 'initial' | 'refresh' | 'silent') => {});
    mockUseTripsList.mockReturnValue(createState({ items: [trip], loadFirstPage }));

    await render(<TripsScreen />);

    const focusCallback = mockUseFocusEffect.mock.calls.at(0)?.[0];
    expect(focusCallback).toBeDefined();
    focusCallback?.();
    await fireEvent.press(screen.getByLabelText('Open trip Da Lat weekend'));

    expect(loadFirstPage).toHaveBeenCalledWith('initial');
    expect(mockRouter.push).toHaveBeenCalledWith('/trips/trip-1');
    expect(screen.getByText('Da Lat')).toBeTruthy();
    expect(screen.getByText('2 members · Captain')).toBeTruthy();
  });

  it('shows the empty CTA and routes to create', async () => {
    mockUseTripsList.mockReturnValue(createState());

    await render(<TripsScreen />);
    await fireEvent.press(screen.getByText('Create your first trip'));

    expect(screen.getByText('No trips yet')).toBeTruthy();
    expect(mockRouter.push).toHaveBeenCalledWith('/trips/create');
  });

  it('opens create from the persistent header action', async () => {
    mockUseTripsList.mockReturnValue(createState({ items: [trip] }));

    await render(<TripsScreen />);
    await fireEvent.press(screen.getByLabelText('Create trip'));

    expect(mockRouter.push).toHaveBeenCalledWith('/trips/create');
  });

  it('shows an initial-load error and retries the first page', async () => {
    const loadFirstPage = jest.fn(async (_mode: 'initial' | 'refresh' | 'silent') => {});
    mockUseTripsList.mockReturnValue(
      createState({
        status: 'error',
        error: { kind: 'network', message: 'Cannot reach the server. Check your connection.' },
        loadFirstPage,
      }),
    );

    await render(<TripsScreen />);
    await fireEvent.press(screen.getByText('Try again'));

    expect(screen.getByText('Could not load trips')).toBeTruthy();
    expect(screen.getByText('Cannot reach the server. Check your connection.')).toBeTruthy();
    expect(loadFirstPage).toHaveBeenCalledWith('initial');
  });

  it('keeps the ready list visible with a non-blocking refresh or pagination error', async () => {
    mockUseTripsList.mockReturnValue(
      createState({
        items: [trip],
        error: { kind: 'network', message: 'Cannot reach the server. Check your connection.' },
      }),
    );

    await render(<TripsScreen />);

    expect(screen.getByLabelText('Open trip Da Lat weekend')).toBeTruthy();
    expect(screen.getByText('Cannot reach the server. Check your connection.')).toBeTruthy();
  });

  it('delegates pull-to-refresh and end-reached loading to the list hook', async () => {
    const loadFirstPage = jest.fn(async (_mode: 'initial' | 'refresh' | 'silent') => {});
    const loadMore = jest.fn(async () => {});
    mockUseTripsList.mockReturnValue(createState({ items: [trip], refreshing: true, loadFirstPage, loadMore }));

    await render(<TripsScreen />);
    const listProps = mockFlatListProps.mock.calls.at(0)?.[0];

    expect(listProps).toBeDefined();
    await listProps?.onRefresh();
    await listProps?.onEndReached();

    expect(listProps?.refreshing).toBe(true);
    expect(loadFirstPage).toHaveBeenCalledWith('refresh');
    expect(loadMore).toHaveBeenCalledTimes(1);
  });
});
