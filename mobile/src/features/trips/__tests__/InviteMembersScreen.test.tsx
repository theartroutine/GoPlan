const mockParams = { tripId: 'trip-1' };
const mockRouter = {
  canGoBack: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
};
const mockUseTripDetail = jest.fn();
const mockUseInviteMembers = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/shared/ui/LoadingScreen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { LoadingScreen: () => React.createElement(Text, null, 'Loading') };
});
jest.mock('../hooks/useTripDetail', () => ({
  useTripDetail: (...args: unknown[]) => mockUseTripDetail(...args),
}));
jest.mock('../hooks/useInviteMembers', () => ({
  useInviteMembers: (...args: unknown[]) => mockUseInviteMembers(...args),
}));

// eslint-disable-next-line import/first
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { InviteMembersScreen } from '../screens/InviteMembersScreen';
// eslint-disable-next-line import/first
import type { TripDetailResponse } from '../types';

const detail: TripDetailResponse = {
  trip: {
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
    status: 'PLANNING',
    currency_code: 'VND',
    timezone: 'Asia/Ho_Chi_Minh',
    budget_estimate: null,
    cancelled_at: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  my_membership: {
    role: 'CAPTAIN',
    status: 'ACTIVE',
    joined_at: '2026-01-01T00:00:00Z',
  },
  members: [],
};

function readyDetail(nextDetail: TripDetailResponse = detail) {
  return {
    detail: nextDetail,
    status: 'ready' as const,
    error: null,
    refreshing: false,
    refresh: jest.fn(),
  };
}

function readyInvite(overrides: Record<string, unknown> = {}) {
  return {
    items: [
      {
        id: 'user-1',
        display_name: 'Lan Nguyen',
        identify_tag: 'lan#1234',
      },
    ],
    status: 'ready' as const,
    loadError: null,
    selectedIds: new Set<string>(),
    selectionError: null,
    submitError: null,
    submitting: false,
    load: jest.fn(),
    toggleSelection: jest.fn(),
    submit: jest.fn().mockResolvedValue(false),
    ...overrides,
  };
}

describe('InviteMembersScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseTripDetail.mockReturnValue(readyDetail());
    mockUseInviteMembers.mockReturnValue(readyInvite());
    mockRouter.canGoBack.mockReturnValue(true);
  });

  it('renders eligible friends as a native multi-select list', async () => {
    const invite = readyInvite();
    mockUseInviteMembers.mockReturnValue(invite);
    await render(<InviteMembersScreen />);

    expect(await screen.findByText('Choose friends')).toBeTruthy();
    const friend = screen.getByRole('checkbox', { name: 'Invite Lan Nguyen' });
    expect(friend.props.accessibilityState).toEqual({ checked: false, disabled: false });
    await fireEvent.press(friend);
    expect(invite.toggleSelection).toHaveBeenCalledWith('user-1');
    expect(screen.getByRole('button', { name: 'Send invitations' }).props.accessibilityState).toEqual({
      disabled: true,
      busy: false,
    });
  });

  it('closes after a successful send and falls back to the trip route without history', async () => {
    const submit = jest.fn().mockResolvedValue(true);
    mockUseInviteMembers.mockReturnValue(
      readyInvite({ selectedIds: new Set(['user-1']), submit }),
    );
    const { rerender } = await render(<InviteMembersScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Send invitations (1)' }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));

    jest.clearAllMocks();
    mockUseTripDetail.mockReturnValue(readyDetail());
    mockUseInviteMembers.mockReturnValue(
      readyInvite({ selectedIds: new Set(['user-1']), submit }),
    );
    mockRouter.canGoBack.mockReturnValue(false);
    await rerender(<InviteMembersScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Send invitations (1)' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/trips/trip-1'));
  });

  it.each([
    ['MEMBER', 'PLANNING'],
    ['CAPTAIN', 'COMPLETED'],
    ['CAPTAIN', 'CANCELLED'],
  ] as const)('guards direct links for a %s on a %s trip', async (role, status) => {
    mockUseTripDetail.mockReturnValue(
      readyDetail({
        ...detail,
        trip: { ...detail.trip, status },
        my_membership: { ...detail.my_membership, role },
      }),
    );
    await render(<InviteMembersScreen />);

    expect(await screen.findByText('Invitations unavailable')).toBeTruthy();
    expect(mockUseInviteMembers).toHaveBeenCalledWith('trip-1', false);
    expect(screen.queryByText('Lan Nguyen')).toBeNull();
  });

  it('shows retry and empty states without submitting', async () => {
    const load = jest.fn();
    mockUseInviteMembers.mockReturnValue(
      readyInvite({
        items: [],
        status: 'error',
        loadError: { kind: 'network', message: 'Cannot reach the server.' },
        load,
      }),
    );
    const { rerender } = await render(<InviteMembersScreen />);
    expect(await screen.findByText('Could not load eligible friends')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(load).toHaveBeenCalledWith('initial');

    mockUseInviteMembers.mockReturnValue(readyInvite({ items: [] }));
    await rerender(<InviteMembersScreen />);
    expect(await screen.findByText('No eligible friends')).toBeTruthy();
    expect(screen.getByText('Select at least one friend to continue.')).toBeTruthy();
  });

  it('renders normalized selection, field, and business errors', async () => {
    mockUseInviteMembers.mockReturnValue(
      readyInvite({
        selectedIds: new Set(['user-1']),
        selectionError: 'You can select up to 20 friends.',
        submitError: {
          kind: 'field',
          message: 'Please fix the highlighted fields.',
          fieldErrors: { invitee_ids: 'One or more users cannot be invited.' },
        },
      }),
    );
    await render(<InviteMembersScreen />);

    expect(await screen.findByText('You can select up to 20 friends.')).toBeTruthy();
    expect(screen.getByText('One or more users cannot be invited.')).toBeTruthy();
  });
});
