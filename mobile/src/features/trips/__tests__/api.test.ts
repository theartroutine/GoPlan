jest.mock('@/shared/api/client', () => ({
  apiClient: { get: jest.fn(), patch: jest.fn(), post: jest.fn() },
}));

// eslint-disable-next-line import/first
import { apiClient } from '@/shared/api/client';
// eslint-disable-next-line import/first
import { extractCursor } from '@/shared/api/pagination';
// eslint-disable-next-line import/first
import {
  cancelTrip,
  completeTrip,
  createTrip,
  getTripDetail,
  leaveTrip,
  listTrips,
  startTrip,
  updateTrip,
} from '../api';

const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
const mockPatch = apiClient.patch as jest.MockedFunction<typeof apiClient.patch>;
const mockPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>;

describe('extractCursor', () => {
  it('returns null for null url', () => {
    expect(extractCursor(null)).toBeNull();
  });

  it('extracts and decodes the cursor param', () => {
    expect(extractCursor('http://10.0.0.2:8000/api/trips?cursor=cD0yMDI2&page=2')).toBe('cD0yMDI2');
    expect(extractCursor('http://x/api/trips?cursor=abc%3D%3D')).toBe('abc==');
  });

  it('returns null when no cursor param exists', () => {
    expect(extractCursor('http://x/api/trips')).toBeNull();
  });
});

describe('trips api', () => {
  beforeEach(() => jest.clearAllMocks());

  it('listTrips requests /trips/ and maps the cursor page', async () => {
    mockGet.mockResolvedValue({
      data: { next: 'http://x/api/trips?cursor=abc', previous: null, results: [{ id: 't1' }] },
    } as never);

    const page = await listTrips();

    expect(mockGet).toHaveBeenCalledWith('/trips/', { params: undefined });
    expect(page.items).toEqual([{ id: 't1' }]);
    expect(page.nextCursor).toBe('abc');
  });

  it('listTrips passes the cursor param when provided', async () => {
    mockGet.mockResolvedValue({ data: { next: null, previous: null, results: [] } } as never);

    const page = await listTrips('abc');

    expect(mockGet).toHaveBeenCalledWith('/trips/', { params: { cursor: 'abc' } });
    expect(page.nextCursor).toBeNull();
  });

  it('createTrip posts the payload and unwraps trip', async () => {
    mockPost.mockResolvedValue({ data: { trip: { id: 't1', name: 'Da Lat' } } } as never);

    const input = {
      name: 'Da Lat',
      destination: 'Da Lat, Vietnam',
      start_date: '2026-08-01',
      end_date: '2026-08-03',
    };
    const trip = await createTrip(input);

    expect(mockPost).toHaveBeenCalledWith('/trips/', input);
    expect(trip).toEqual({ id: 't1', name: 'Da Lat' });
  });

  it('getTripDetail requests the trip by id', async () => {
    const payload = { trip: { id: 't1' }, my_membership: { role: 'CAPTAIN' }, members: [] };
    mockGet.mockResolvedValue({ data: payload } as never);

    const detail = await getTripDetail('t1');

    expect(mockGet).toHaveBeenCalledWith('/trips/t1');
    expect(detail).toEqual(payload);
  });

  it('updateTrip patches the payload and unwraps trip', async () => {
    mockPatch.mockResolvedValue({ data: { trip: { id: 't1', name: 'Updated trip' } } } as never);

    const trip = await updateTrip('t1', { name: 'Updated trip', budget_estimate: null });

    expect(mockPatch).toHaveBeenCalledWith('/trips/t1', { name: 'Updated trip', budget_estimate: null });
    expect(trip).toEqual({ id: 't1', name: 'Updated trip' });
  });

  it.each([
    ['start', startTrip, 'ONGOING'],
    ['complete', completeTrip, 'COMPLETED'],
    ['cancel', cancelTrip, 'CANCELLED'],
  ] as const)('%sTrip posts to the lifecycle endpoint and unwraps status', async (action, request, status) => {
    mockPost.mockResolvedValue({ data: { status } } as never);

    await expect(request('t1')).resolves.toBe(status);

    expect(mockPost).toHaveBeenCalledWith(`/trips/t1/${action}`);
  });

  it('leaveTrip posts to the leave endpoint', async () => {
    mockPost.mockResolvedValue({ data: {} } as never);

    await expect(leaveTrip('t1')).resolves.toBeUndefined();

    expect(mockPost).toHaveBeenCalledWith('/trips/t1/leave');
  });
});
