import { Pressable, Text, View } from 'react-native';

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('../api', () => ({
  createTrip: jest.fn(),
}));

interface MockDateFieldProps {
  label: string;
  onChange: (date: Date) => void;
  error?: string;
}

function mockDateField({ label, onChange, error }: MockDateFieldProps) {
  const isStartDate = label === 'Start date';
  return (
    <View>
      <Text>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Set ${label} to June 1`}
        onPress={() => onChange(new Date(2026, 5, 1))}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Set ${label} to June ${isStartDate ? '10' : '3'}`}
        onPress={() => onChange(new Date(2026, 5, isStartDate ? 10 : 3))}
      />
      {error ? <Text>{error}</Text> : null}
    </View>
  );
}

jest.mock('@/shared/ui/DateField', () => ({ DateField: mockDateField }));

// eslint-disable-next-line import/first
import { AxiosError, AxiosHeaders } from 'axios';
// eslint-disable-next-line import/first
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { createTrip } from '../api';
// eslint-disable-next-line import/first
import { CreateTripScreen } from '../screens/CreateTripScreen';

const mockCreateTrip = createTrip as jest.MockedFunction<typeof createTrip>;

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

async function fillRequiredFields(): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText('Trip name'), '  Summer escape  ');
  await fireEvent.changeText(screen.getByLabelText('Destination'), '  Da Lat, Vietnam  ');
}

describe('CreateTripScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('submits optional values and replaces the route with the created trip detail', async () => {
    mockCreateTrip.mockResolvedValue({ id: 'trip-123' } as never);

    await render(<CreateTripScreen />);
    await fillRequiredFields();
    await fireEvent.changeText(screen.getByLabelText('Description'), '  Mountain air  ');
    await fireEvent.changeText(screen.getByLabelText('Budget estimate'), ' 5000000.00 ');
    await fireEvent.press(screen.getByLabelText('Currency USD'));
    await fireEvent.press(screen.getByLabelText('Set Start date to June 1'));
    await fireEvent.press(screen.getByLabelText('Set End date to June 3'));
    await fireEvent.press(screen.getByText('Create trip'));

    await waitFor(() =>
      expect(mockCreateTrip).toHaveBeenCalledWith({
        name: 'Summer escape',
        destination: 'Da Lat, Vietnam',
        start_date: '2026-06-01',
        end_date: '2026-06-03',
        description: 'Mountain air',
        budget_estimate: '5000000.00',
        currency_code: 'USD',
      }),
    );
    expect(mockRouter.replace).toHaveBeenCalledWith('/trips/trip-123');
  });

  it('blocks a local end-date-before-start-date submission', async () => {
    await render(<CreateTripScreen />);
    await fillRequiredFields();
    await fireEvent.press(screen.getByLabelText('Set Start date to June 10'));
    await fireEvent.press(screen.getByLabelText('Set End date to June 1'));
    await fireEvent.press(screen.getByText('Create trip'));

    expect(await screen.findByText('End date must be on or after the start date.')).toBeTruthy();
    expect(mockCreateTrip).not.toHaveBeenCalled();
  });

  it('renders DRF field errors beside their corresponding fields', async () => {
    mockCreateTrip.mockRejectedValue(
      axiosErrorWith(400, {
        destination: ['Choose a valid destination.'],
        budget_estimate: ['A non-negative number is required.'],
        currency_code: ['Unsupported trip currency code.'],
      }),
    );

    await render(<CreateTripScreen />);
    await fillRequiredFields();
    await fireEvent.press(screen.getByText('Create trip'));

    expect(await screen.findByText('Choose a valid destination.')).toBeTruthy();
    expect(await screen.findByText('A non-negative number is required.')).toBeTruthy();
    expect(await screen.findByText('Unsupported trip currency code.')).toBeTruthy();
  });

  it('renders the backend business-error message', async () => {
    mockCreateTrip.mockRejectedValue(
      axiosErrorWith(409, {
        detail: 'This trip cannot be created right now.',
        error_code: 'TRIP_CONFLICT',
      }),
    );

    await render(<CreateTripScreen />);
    await fillRequiredFields();
    await fireEvent.press(screen.getByText('Create trip'));

    expect(await screen.findByText('This trip cannot be created right now.')).toBeTruthy();
  });

  it('renders the generic error for a non-API failure', async () => {
    mockCreateTrip.mockRejectedValue(new Error('offline'));

    await render(<CreateTripScreen />);
    await fillRequiredFields();
    await fireEvent.press(screen.getByText('Create trip'));

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeTruthy();
  });
});
