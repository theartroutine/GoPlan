const mockUseFocusEffect = jest.fn();
const mockUseAppForegroundEffect = jest.fn();

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => (() => void) | void) => mockUseFocusEffect(effect),
}));

jest.mock('@/shared/hooks/useAppForegroundEffect', () => ({
  useAppForegroundEffect: (listener: () => void) => mockUseAppForegroundEffect(listener),
}));

jest.mock('../api', () => ({
  getTripDetail: jest.fn(),
}));

// eslint-disable-next-line import/first
import { AxiosError, AxiosHeaders } from 'axios';
// eslint-disable-next-line import/first
import { act, renderHook, waitFor } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { getTripDetail } from '../api';
// eslint-disable-next-line import/first
import { useTripDetail } from '../hooks/useTripDetail';
// eslint-disable-next-line import/first
import { publishTripEvent } from '../tripEvents';

const mockGetTripDetail = getTripDetail as jest.MockedFunction<typeof getTripDetail>;

const trip = {
  id: 'trip-1',
  name: 'Da Lat escape',
  destination: 'Da Lat, Vietnam',
  destination_provider: '',
  destination_provider_id: '',
  destination_lat: null,
  destination_lng: null,
  destination_country_code: 'VN',
  cover_image_url: '',
  start_date: '2026-08-01',
  end_date: '2026-08-03',
  description: '',
  status: 'PLANNING' as const,
  currency_code: 'VND',
  timezone: 'Asia/Ho_Chi_Minh',
  budget_estimate: null,
  cancelled_at: null,
  created_at: '2026-01-01T00:00:00Z',
};

const tripDetail = {
  trip,
  my_membership: { role: 'CAPTAIN' as const, status: 'ACTIVE' as const, joined_at: '2026-01-01T00:00:00Z' },
  members: [],
};

const member = {
  membership_id: 'membership-2',
  user: {
    id: 'user-2',
    display_name: 'Lan Nguyen',
    identify_tag: 'lan#1234',
    avatar_url: null,
  },
  role: 'MEMBER' as const,
  joined_at: '2026-01-02T00:00:00Z',
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

function latestFocusCallback(): () => (() => void) | void {
  const callback = mockUseFocusEffect.mock.calls.at(-1)?.[0] as (() => (() => void) | void) | undefined;
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

describe('useTripDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads on focus then silently refreshes while retaining the detail', async () => {
    mockGetTripDetail.mockResolvedValue(tripDetail);
    const { result, unmount } = await renderHook(() => useTripDetail('trip-1'));

    await act(async () => {
      latestFocusCallback()();
    });
    await waitFor(() => expect(result.current.detail).toEqual(tripDetail));

    await act(async () => {
      latestFocusCallback()();
    });

    expect(mockGetTripDetail).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('ready');
    expect(result.current.refreshing).toBe(false);
    unmount();
  });

  it('retains rendered detail after a non-404 foreground refresh failure', async () => {
    mockGetTripDetail
      .mockResolvedValueOnce(tripDetail)
      .mockRejectedValueOnce(axiosErrorWith(500, { detail: 'Service unavailable.' }));
    const { result, unmount } = await renderHook(() => useTripDetail('trip-1'));

    await act(async () => {
      latestFocusCallback()();
    });
    await waitFor(() => expect(result.current.detail).toEqual(tripDetail));
    await act(async () => {
      latestForegroundCallback()();
    });

    await waitFor(() => expect(result.current.error?.message).toBe('Service unavailable.'));
    expect(result.current.detail).toEqual(tripDetail);
    expect(result.current.status).toBe('ready');
    unmount();
  });

  it('reconciles member data when the app returns to foreground', async () => {
    const detailWithMember = { ...tripDetail, members: [member] };
    mockGetTripDetail
      .mockResolvedValueOnce(tripDetail)
      .mockResolvedValueOnce(detailWithMember);
    const { result, unmount } = await renderHook(() => useTripDetail('trip-1'));
    await act(async () => {
      latestFocusCallback()();
    });
    await waitFor(() => expect(result.current.detail).toEqual(tripDetail));

    await act(async () => {
      latestForegroundCallback()();
    });

    await waitFor(() => expect(result.current.detail?.members).toEqual([member]));
    expect(mockGetTripDetail).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('clears the detail for a generic not-found response without exposing membership state', async () => {
    mockGetTripDetail.mockRejectedValue(
      axiosErrorWith(404, { detail: 'Trip not found.', error_code: 'TRIP_NOT_FOUND' }),
    );
    const { result, unmount } = await renderHook(() => useTripDetail('trip-1'));

    await act(async () => {
      latestFocusCallback()();
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.detail).toBeNull();
    expect(result.current.error).toMatchObject({
      message: 'Trip not found.',
      errorCode: 'TRIP_NOT_FOUND',
      status: 404,
    });
    unmount();
  });

  it('ignores a request resolved after blur and only commits the latest focused request', async () => {
    const first = deferred<typeof tripDetail>();
    const second = deferred<typeof tripDetail>();
    mockGetTripDetail.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, unmount } = await renderHook(() => useTripDetail('trip-1'));

    let cleanup: (() => void) | void = undefined;
    await act(async () => {
      cleanup = latestFocusCallback()();
    });
    await act(async () => {
      cleanup?.();
      latestFocusCallback()();
    });
    await act(async () => {
      first.resolve({ ...tripDetail, trip: { ...trip, name: 'Stale response' } });
    });
    expect(result.current.detail).toBeNull();
    await act(async () => {
      second.resolve(tripDetail);
    });

    await waitFor(() => expect(result.current.detail?.trip.name).toBe('Da Lat escape'));
    unmount();
  });

  it('patches rendered data immediately from update and status events', async () => {
    mockGetTripDetail.mockResolvedValue(tripDetail);
    const { result, unmount } = await renderHook(() => useTripDetail('trip-1'));

    await act(async () => {
      latestFocusCallback()();
    });
    await waitFor(() => expect(result.current.detail).toEqual(tripDetail));

    await act(async () => {
      publishTripEvent({ type: 'updated', trip: { ...trip, name: 'Updated Da Lat' } });
      publishTripEvent({ type: 'statusChanged', tripId: 'trip-1', status: 'ONGOING' });
    });

    expect(result.current.detail?.trip).toMatchObject({ name: 'Updated Da Lat', status: 'ONGOING' });
    unmount();
  });

  it('removes a member locally and prevents an older detail response from restoring them', async () => {
    const detailWithMember = { ...tripDetail, members: [member] };
    const staleRefresh = deferred<typeof detailWithMember>();
    mockGetTripDetail
      .mockResolvedValueOnce(detailWithMember)
      .mockReturnValueOnce(staleRefresh.promise);
    const { result, unmount } = await renderHook(() => useTripDetail('trip-1'));

    await act(async () => {
      latestFocusCallback()();
    });
    await waitFor(() => expect(result.current.detail?.members).toEqual([member]));
    await act(async () => {
      void result.current.refresh('silent');
      publishTripEvent({ type: 'memberRemoved', tripId: 'trip-1', userId: 'user-2' });
    });

    expect(result.current.detail?.members).toEqual([]);
    await act(async () => {
      staleRefresh.resolve(detailWithMember);
    });

    expect(result.current.detail?.members).toEqual([]);
    expect(result.current.refreshing).toBe(false);
    unmount();
  });
});
