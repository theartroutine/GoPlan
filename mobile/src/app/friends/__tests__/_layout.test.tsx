const mockRouter = { canGoBack: jest.fn(), back: jest.fn(), replace: jest.fn() };
const mockUseSession = jest.fn();
const mockStackScreen = jest.fn();

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  function MockStack({ children }: { children: import('react').ReactNode }) {
    return React.createElement(View, null, children);
  }

  MockStack.Screen = function MockStackScreen({
    name,
    options,
  }: {
    name: string;
    options: {
      title: string;
      presentation?: string;
      headerLeft?: () => import('react').ReactNode;
    };
  }) {
    mockStackScreen({ name, options });
    return React.createElement(View, { testID: `screen-${name}` }, options.headerLeft?.());
  };

  return {
    Redirect: ({ href }: { href: string }) => React.createElement(View, { testID: `redirect-${href}` }),
    Stack: MockStack,
    useRouter: () => mockRouter,
  };
});

jest.mock('@/features/auth/session', () => ({ useSession: () => mockUseSession() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/shared/ui/LoadingScreen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { LoadingScreen: () => React.createElement(View, { testID: 'loading-session' }) };
});

// eslint-disable-next-line import/first
import { fireEvent, render, screen } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import FriendsLayout from '../_layout';

describe('FriendsLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({ status: 'signedIn', user: { requires_profile_setup: false } });
  });

  it('registers Add Friend as a native modal and Requests as a pushed screen', async () => {
    await render(<FriendsLayout />);

    expect(screen.getByTestId('screen-add')).toBeTruthy();
    expect(screen.getByTestId('screen-requests')).toBeTruthy();
    const registrations = mockStackScreen.mock.calls.map(([registration]) => registration);
    expect(registrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'add', options: expect.objectContaining({ presentation: 'modal' }) }),
        expect.objectContaining({ name: 'requests', options: expect.objectContaining({ title: 'Friend Requests' }) }),
      ]),
    );
  });

  it('dismisses Add Friend through native history when available', async () => {
    mockRouter.canGoBack.mockReturnValue(true);
    await render(<FriendsLayout />);

    await fireEvent.press(screen.getByLabelText('Cancel adding a friend'));

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('returns a history-less Add Friend deep link to the Friends tab', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    await render(<FriendsLayout />);

    await fireEvent.press(screen.getByLabelText('Cancel adding a friend'));

    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/friends');
  });

  it('provides a native-header path back from the initial Requests route', async () => {
    mockRouter.canGoBack.mockReturnValue(true);
    await render(<FriendsLayout />);

    await fireEvent.press(screen.getByLabelText('Back to Friends'));

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('returns a history-less Requests deep link to the Friends tab', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    await render(<FriendsLayout />);

    await fireEvent.press(screen.getByLabelText('Back to Friends'));

    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/friends');
  });

  it('shows the session restoration fallback', async () => {
    mockUseSession.mockReturnValue({ status: 'restoring', user: null });
    await render(<FriendsLayout />);

    expect(screen.getByTestId('loading-session')).toBeTruthy();
  });

  it('redirects signed-out users to login', async () => {
    mockUseSession.mockReturnValue({ status: 'signedOut', user: null });
    await render(<FriendsLayout />);

    expect(screen.getByTestId('redirect-/(auth)/login')).toBeTruthy();
  });

  it('redirects incomplete profiles to profile setup', async () => {
    mockUseSession.mockReturnValue({ status: 'signedIn', user: { requires_profile_setup: true } });
    await render(<FriendsLayout />);

    expect(screen.getByTestId('redirect-/(auth)/profile-setup')).toBeTruthy();
  });
});
