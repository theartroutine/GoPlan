const mockParams = { tripId: 'trip-123' };
interface MockStackScreenProps {
  options: { title: string };
}

const mockStackScreen = jest.fn((_props: MockStackScreenProps) => null);

jest.mock('expo-router', () => ({
  Stack: { Screen: (props: MockStackScreenProps) => mockStackScreen(props) },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('expo-image', () => ({
  Image: () => null,
}));

jest.mock('../api', () => ({
  getTripDetail: jest.fn(),
}));

// eslint-disable-next-line import/first
import { AxiosError, AxiosHeaders } from 'axios';
// eslint-disable-next-line import/first
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { getTripDetail } from '../api';
// eslint-disable-next-line import/first
import { TripDetailScreen } from '../screens/TripDetailScreen';

const mockGetTripDetail = getTripDetail as jest.MockedFunction<typeof getTripDetail>;

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

const tripDetail = {
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
    status: 'PLANNING' as const,
    currency_code: 'VND',
    timezone: 'Asia/Ho_Chi_Minh',
    budget_estimate: '5000000.00',
    cancelled_at: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  my_membership: {
    role: 'CAPTAIN' as const,
    status: 'ACTIVE' as const,
    joined_at: '2026-01-01T00:00:00Z',
  },
  members: [
    {
      membership_id: 'membership-1',
      user: { id: 'user-1', display_name: 'Quang Minh', identify_tag: 'QUA001', avatar_url: null },
      role: 'CAPTAIN' as const,
      joined_at: '2026-01-01T00:00:00Z',
    },
    {
      membership_id: 'membership-2',
      user: { id: 'user-2', display_name: 'An Nguyen', identify_tag: 'ANG002', avatar_url: null },
      role: 'MEMBER' as const,
      joined_at: '2026-01-02T00:00:00Z',
    },
  ],
};

describe('TripDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.tripId = 'trip-123';
  });

  it('renders the trip overview and all members', async () => {
    mockGetTripDetail.mockResolvedValue(tripDetail);

    await render(<TripDetailScreen />);

    expect(await screen.findByText('Overview')).toBeTruthy();
    expect(mockStackScreen.mock.calls.some(([props]) => props.options.title === 'Da Lat escape')).toBe(true);
    expect(screen.getByText('Planning')).toBeTruthy();
    expect(screen.getByText('Da Lat, Vietnam')).toBeTruthy();
    expect(screen.getByText('Jun 1, 2026 – Jun 3, 2026')).toBeTruthy();
    expect(screen.getByText('5,000,000 VND')).toBeTruthy();
    expect(screen.getByText('Mountain air and coffee.')).toBeTruthy();
    expect(screen.getByText('Members (2)')).toBeTruthy();
    expect(screen.getByText('Quang Minh')).toBeTruthy();
    expect(screen.getByText('An Nguyen')).toBeTruthy();
    expect(mockGetTripDetail).toHaveBeenCalledWith('trip-123');
  });

  it('shows one friendly not-found state for a 404 response', async () => {
    mockGetTripDetail.mockRejectedValue(
      axiosErrorWith(404, { detail: 'Trip not found.', error_code: 'TRIP_NOT_FOUND' }),
    );

    await render(<TripDetailScreen />);

    expect(await screen.findByText('Trip not found')).toBeTruthy();
    expect(screen.getByText('This trip does not exist or you are not a member of it.')).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('retries a non-404 error and renders the recovered detail', async () => {
    mockGetTripDetail
      .mockRejectedValueOnce(axiosErrorWith(500, { detail: 'Service unavailable.' }))
      .mockResolvedValueOnce(tripDetail);

    await render(<TripDetailScreen />);

    expect(await screen.findByText('Could not load trip')).toBeTruthy();
    expect(screen.getByText('Service unavailable.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));

    await waitFor(() => expect(mockGetTripDetail).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Overview')).toBeTruthy();
  });
});
