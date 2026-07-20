jest.mock('../api', () => ({
  listTrips: jest.fn(),
}));

// eslint-disable-next-line import/first
import { act, renderHook, waitFor } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { listTrips } from '../api';
// eslint-disable-next-line import/first
import { useTripsList } from '../hooks/useTripsList';

const mockListTrips = listTrips as jest.MockedFunction<typeof listTrips>;

const tripA = {
  id: 'trip-a',
  name: 'Da Lat',
  destination: 'Da Lat',
  cover_image_url: '',
  start_date: '2026-08-01',
  end_date: '2026-08-03',
  status: 'PLANNING' as const,
  currency_code: 'VND',
  budget_estimate: null,
  member_count: 1,
  my_role: 'CAPTAIN' as const,
};

const tripB = { ...tripA, id: 'trip-b', name: 'Hoi An' };

describe('useTripsList', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads the first page, appends a de-duplicated cursor page, and stops at the end', async () => {
    mockListTrips
      .mockResolvedValueOnce({ items: [tripA], nextCursor: 'cursor-1' })
      .mockResolvedValueOnce({ items: [tripA, tripB], nextCursor: null });

    const { result } = await renderHook(() => useTripsList());

    await act(async () => {
      await result.current.loadFirstPage('initial');
    });
    await act(async () => {
      await result.current.loadMore();
    });
    await act(async () => {
      await result.current.loadMore();
    });

    expect(mockListTrips).toHaveBeenNthCalledWith(1);
    expect(mockListTrips).toHaveBeenNthCalledWith(2, 'cursor-1');
    expect(mockListTrips).toHaveBeenCalledTimes(2);
    expect(result.current.items).toEqual([tripA, tripB]);
    expect(result.current.status).toBe('ready');
    expect(result.current.loadingMore).toBe(false);
  });

  it('does not start a second request while the first page is in flight', async () => {
    mockListTrips.mockImplementationOnce(() => new Promise(() => {}));

    const { result } = await renderHook(() => useTripsList());

    await act(async () => {
      void result.current.loadFirstPage('initial');
      await result.current.loadMore();
    });

    expect(mockListTrips).toHaveBeenCalledTimes(1);
    expect(result.current.loadingMore).toBe(false);
  });

  it('replaces existing pages during refresh and resets the cursor', async () => {
    mockListTrips
      .mockResolvedValueOnce({ items: [tripA], nextCursor: 'cursor-1' })
      .mockResolvedValueOnce({ items: [tripB], nextCursor: null });

    const { result } = await renderHook(() => useTripsList());

    await act(async () => {
      await result.current.loadFirstPage('initial');
    });
    await act(async () => {
      await result.current.loadFirstPage('refresh');
    });
    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.items).toEqual([tripB]);
    expect(result.current.refreshing).toBe(false);
    expect(mockListTrips).toHaveBeenCalledTimes(2);
  });

  it('preserves the rendered list when a silent focus refresh fails', async () => {
    mockListTrips
      .mockResolvedValueOnce({ items: [tripA], nextCursor: 'cursor-1' })
      .mockRejectedValueOnce(new Error('offline'));

    const { result } = await renderHook(() => useTripsList());

    await act(async () => {
      await result.current.loadFirstPage('initial');
    });
    await act(async () => {
      await result.current.loadFirstPage('silent');
    });

    expect(result.current.items).toEqual([tripA]);
    expect(result.current.status).toBe('ready');
    expect(result.current.error).toBeNull();
  });

  it('finishes a failed pull-to-refresh while retaining the ready list and exposing the error', async () => {
    mockListTrips
      .mockResolvedValueOnce({ items: [tripA], nextCursor: 'cursor-1' })
      .mockRejectedValueOnce(new Error('offline'));

    const { result } = await renderHook(() => useTripsList());

    await act(async () => {
      await result.current.loadFirstPage('initial');
    });
    await act(async () => {
      await result.current.loadFirstPage('refresh');
    });

    expect(mockListTrips).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.items).toEqual([tripA]);
    expect(result.current.status).toBe('ready');
    expect(result.current.error?.message).toBe('Something went wrong. Please try again.');
    expect(result.current.refreshing).toBe(false);
  });
});
