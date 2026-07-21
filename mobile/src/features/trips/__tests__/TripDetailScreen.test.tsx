import { Alert } from 'react-native';

const mockParams = { tripId: 'trip-123' };
const mockRouter = { push: jest.fn(), dismissTo: jest.fn() };
const mockUseTripDetail = jest.fn();
const mockPublishTripEvent = jest.fn();

interface MockStackScreenProps {
  options: { title: string };
}

const mockStackScreen = jest.fn((_props: MockStackScreenProps) => null);

jest.mock('expo-router', () => ({
  Stack: { Screen: (props: MockStackScreenProps) => mockStackScreen(props) },
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('../hooks/useTripDetail', () => ({ useTripDetail: (...args: unknown[]) => mockUseTripDetail(...args) }));
jest.mock('../tripEvents', () => ({ publishTripEvent: (...args: unknown[]) => mockPublishTripEvent(...args) }));
jest.mock('../api', () => ({
  startTrip: jest.fn(),
  completeTrip: jest.fn(),
  cancelTrip: jest.fn(),
  leaveTrip: jest.fn(),
}));

// eslint-disable-next-line import/first
import { AxiosError, AxiosHeaders } from 'axios';
// eslint-disable-next-line import/first
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { cancelTrip, completeTrip, leaveTrip, startTrip } from '../api';
// eslint-disable-next-line import/first
import { TripDetailScreen } from '../screens/TripDetailScreen';
// eslint-disable-next-line import/first
import type { TripDetailResponse } from '../types';
// eslint-disable-next-line import/first
import type { ApiError } from '@/shared/api/errors';

const mockStartTrip = startTrip as jest.MockedFunction<typeof startTrip>;
const mockCompleteTrip = completeTrip as jest.MockedFunction<typeof completeTrip>;
const mockCancelTrip = cancelTrip as jest.MockedFunction<typeof cancelTrip>;
const mockLeaveTrip = leaveTrip as jest.MockedFunction<typeof leaveTrip>;
const notFoundError: ApiError = { kind: 'message', message: 'Trip not found.', errorCode: 'TRIP_NOT_FOUND', status: 404 };

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

const tripDetail: TripDetailResponse = {
  trip: {
    id: 'trip-123',
    name: 'Da Lat escape',
    destination: 'Da Lat, Vietnam',
    destination_provider: '',
    destination_provider_id: '',
    destination_lat: null,
    destination_lng: null,
    destination_country_code: 'VN',
    cover_image_url: '/media/trip-covers/da-lat.jpg',
    start_date: '2026-06-01',
    end_date: '2026-06-03',
    description: 'Mountain air and coffee.',
    status: 'PLANNING',
    currency_code: 'VND',
    timezone: 'Asia/Ho_Chi_Minh',
    budget_estimate: '5000000.00',
    cancelled_at: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  my_membership: { role: 'CAPTAIN', status: 'ACTIVE', joined_at: '2026-01-01T00:00:00Z' },
  members: [
    {
      membership_id: 'membership-1',
      user: { id: 'user-1', display_name: 'Quang Minh', identify_tag: 'QUA001', avatar_url: null },
      role: 'CAPTAIN',
      joined_at: '2026-01-01T00:00:00Z',
    },
  ],
};

function readyHook(detail: TripDetailResponse = tripDetail) {
  return {
    detail,
    status: 'ready' as const,
    error: null,
    refreshing: false,
    refresh: jest.fn().mockResolvedValue(undefined),
    applyStatus: jest.fn(),
  };
}

async function confirmAlertAction(label: string): Promise<void> {
  const buttons = jest.mocked(Alert.alert).mock.calls[0]?.[2];
  const confirm = buttons?.find((button) => button.text === label);
  await act(async () => {
    confirm?.onPress?.();
  });
}

describe('TripDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.tripId = 'trip-123';
    mockUseTripDetail.mockReturnValue(readyHook());
  });

  afterEach(() => jest.restoreAllMocks());

  it('renders the trip overview and captain actions, then opens the edit route', async () => {
    await render(<TripDetailScreen />);

    expect(await screen.findByText('Overview')).toBeTruthy();
    expect(mockStackScreen.mock.calls.some(([props]) => props.options.title === 'Da Lat escape')).toBe(true);
    expect(screen.getByText('Planning')).toBeTruthy();
    expect(screen.getByText('Da Lat, Vietnam')).toBeTruthy();
    expect(screen.getByText('Members (1)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start trip' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel trip' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Edit trip' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/trips/trip-123/edit');
  });

  it('shows only leave for an active member and no actions for a terminal trip', async () => {
    mockUseTripDetail.mockReturnValue(
      readyHook({ ...tripDetail, my_membership: { ...tripDetail.my_membership, role: 'MEMBER' } }),
    );
    const { rerender } = await render(<TripDetailScreen />);
    expect(screen.getByRole('button', { name: 'Leave trip' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit trip' })).toBeNull();

    mockUseTripDetail.mockReturnValue(
      readyHook({ ...tripDetail, trip: { ...tripDetail.trip, status: 'COMPLETED' } }),
    );
    await rerender(<TripDetailScreen />);
    expect(screen.queryByLabelText('Trip actions')).toBeNull();
  });

  it('applies a successful start immediately, publishes it, and silently refreshes', async () => {
    const hook = readyHook();
    mockUseTripDetail.mockReturnValue(hook);
    mockStartTrip.mockResolvedValue('ONGOING');
    await render(<TripDetailScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Start trip' }));

    await waitFor(() => expect(mockStartTrip).toHaveBeenCalledWith('trip-123'));
    expect(hook.applyStatus).toHaveBeenCalledWith('ONGOING');
    expect(mockPublishTripEvent).toHaveBeenCalledWith({ type: 'statusChanged', tripId: 'trip-123', status: 'ONGOING' });
    expect(hook.refresh).toHaveBeenCalledWith('silent');
  });

  it('confirms and completes an ongoing trip', async () => {
    const hook = readyHook({ ...tripDetail, trip: { ...tripDetail.trip, status: 'ONGOING' } });
    mockUseTripDetail.mockReturnValue(hook);
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockCompleteTrip.mockResolvedValue('COMPLETED');
    await render(<TripDetailScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Complete trip' }));
    await confirmAlertAction('Complete trip');

    await waitFor(() => expect(mockCompleteTrip).toHaveBeenCalledWith('trip-123'));
    expect(hook.applyStatus).toHaveBeenCalledWith('COMPLETED');
  });

  it('confirms and cancels an ongoing trip', async () => {
    const hook = readyHook({ ...tripDetail, trip: { ...tripDetail.trip, status: 'ONGOING' } });
    mockUseTripDetail.mockReturnValue(hook);
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockCancelTrip.mockResolvedValue('CANCELLED');
    await render(<TripDetailScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel trip' }));
    await confirmAlertAction('Cancel trip');

    await waitFor(() => expect(mockCancelTrip).toHaveBeenCalledWith('trip-123'));
    expect(hook.applyStatus).toHaveBeenCalledWith('CANCELLED');
  });

  it('confirms leave, removes the trip from event consumers, and dismisses to tabs', async () => {
    mockUseTripDetail.mockReturnValue(
      readyHook({ ...tripDetail, my_membership: { ...tripDetail.my_membership, role: 'MEMBER' } }),
    );
    mockLeaveTrip.mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    await render(<TripDetailScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Leave trip' }));
    await confirmAlertAction('Leave trip');

    await waitFor(() => expect(mockLeaveTrip).toHaveBeenCalledWith('trip-123'));
    expect(mockPublishTripEvent).toHaveBeenCalledWith({ type: 'removed', tripId: 'trip-123' });
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)');
  });

  it('renders the exact backend mutation error message', async () => {
    mockStartTrip.mockRejectedValue(
      axiosErrorWith(409, { detail: 'This trip cannot be started from its current status.', error_code: 'INVALID_STATUS_TRANSITION' }),
    );
    await render(<TripDetailScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Start trip' }));
    expect(await screen.findByText('This trip cannot be started from its current status.')).toBeTruthy();
  });

  it('shows one friendly not-found state for a 404 response', async () => {
    mockUseTripDetail.mockReturnValue({ ...readyHook(), detail: null, status: 'error', error: notFoundError });
    await render(<TripDetailScreen />);

    expect(await screen.findByText('Trip not found')).toBeTruthy();
    expect(screen.getByText('This trip does not exist or you are not a member of it.')).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
  });
});
