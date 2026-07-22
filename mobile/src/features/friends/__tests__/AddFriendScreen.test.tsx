const mockUseFriendSearch = jest.fn();

jest.mock('../hooks/useFriendSearch', () => ({
  useFriendSearch: () => mockUseFriendSearch(),
}));

jest.mock('expo-image', () => ({ Image: () => null }));

// eslint-disable-next-line import/first
import { fireEvent, render, screen } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import { AddFriendScreen } from '../screens/AddFriendScreen';
// eslint-disable-next-line import/first
import type { useFriendSearch } from '../hooks/useFriendSearch';
// eslint-disable-next-line import/first
import type { FriendUser } from '../types';

type FriendSearchState = ReturnType<typeof useFriendSearch>;

const user: FriendUser = {
  id: 'user-2',
  display_name: 'Minh Anh',
  identify_tag: 'minhanh#AB12',
  avatar_url: null,
};

function createState(overrides: Partial<FriendSearchState> = {}): FriendSearchState {
  return {
    query: '',
    setQuery: jest.fn(),
    user: null,
    searchStatus: 'idle',
    searchError: null,
    search: jest.fn(async () => {}),
    sendStatus: 'idle',
    sendError: null,
    friendRequest: null,
    sendRequest: jest.fn(async () => {}),
    ...overrides,
  };
}

describe('AddFriendScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates the identify tag and starts an exact search', async () => {
    const setQuery = jest.fn();
    const search = jest.fn(async () => {});
    mockUseFriendSearch.mockReturnValue(createState({ query: 'minhanh#AB12', setQuery, search }));

    await render(<AddFriendScreen />);
    await fireEvent.changeText(screen.getByLabelText('Identify tag'), 'other#CD34');
    await fireEvent.press(screen.getByRole('button', { name: 'Search' }));

    expect(setQuery).toHaveBeenCalledWith('other#CD34');
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('shows one neutral state when search returns no user', async () => {
    mockUseFriendSearch.mockReturnValue(createState({ query: 'unknown#NONE', searchStatus: 'notFound' }));

    await render(<AddFriendScreen />);

    expect(screen.getByText('No user found')).toBeTruthy();
    expect(screen.getByText('Check the identify tag and try again.')).toBeTruthy();
    expect(screen.queryByText(/yourself/i)).toBeNull();
  });

  it('renders the found user, sends a request, and shows the completed state', async () => {
    const sendRequest = jest.fn(async () => {});
    mockUseFriendSearch.mockReturnValue(
      createState({ query: user.identify_tag, user, searchStatus: 'found', sendRequest }),
    );

    const { rerender } = await render(<AddFriendScreen />);
    expect(screen.getByText('Minh Anh')).toBeTruthy();
    expect(screen.getByText('minhanh#AB12')).toBeTruthy();
    expect(screen.getByText('MA')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Send friend request' }));
    expect(sendRequest).toHaveBeenCalledTimes(1);

    mockUseFriendSearch.mockReturnValue(
      createState({ query: user.identify_tag, user, searchStatus: 'found', sendStatus: 'sent' }),
    );
    await rerender(<AddFriendScreen />);

    expect(screen.getByText('Friend request sent.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send friend request' })).toBeNull();
  });

  it('displays malformed-query detail and field errors through the normalized error shape', async () => {
    mockUseFriendSearch.mockReturnValue(
      createState({
        query: 'malformed',
        searchStatus: 'error',
        searchError: {
          kind: 'message',
          message: 'Enter an identify tag in name#CODE format.',
          errorCode: 'INVALID_SEARCH_QUERY',
          status: 400,
        },
      }),
    );
    const { rerender } = await render(<AddFriendScreen />);
    expect(screen.getByText('Enter an identify tag in name#CODE format.')).toBeTruthy();

    mockUseFriendSearch.mockReturnValue(
      createState({
        query: 'malformed',
        searchStatus: 'error',
        searchError: {
          kind: 'field',
          message: 'Please fix the highlighted fields.',
          fieldErrors: { q: 'Use the name#CODE format.' },
          status: 400,
        },
      }),
    );
    await rerender(<AddFriendScreen />);

    expect(screen.getByText('Use the name#CODE format.')).toBeTruthy();
  });

  it('shows backend friend-request business errors exactly as returned', async () => {
    mockUseFriendSearch.mockReturnValue(
      createState({
        query: user.identify_tag,
        user,
        searchStatus: 'found',
        sendError: {
          kind: 'message',
          message: 'A friend request is already pending.',
          errorCode: 'DUPLICATE_PENDING',
          status: 409,
        },
      }),
    );

    await render(<AddFriendScreen />);

    expect(screen.getByText('A friend request is already pending.')).toBeTruthy();
  });
});
