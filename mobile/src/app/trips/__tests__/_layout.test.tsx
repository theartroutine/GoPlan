const mockRouter = {
  canGoBack: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
};
const mockUseSession = jest.fn();

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  function MockStack({ children }: { children: import('react').ReactNode }) {
    return React.createElement(View, null, children);
  }

  MockStack.Screen = function MockStackScreen({
    options,
  }: {
    options: { headerLeft?: () => import('react').ReactNode };
  }) {
    return React.createElement(View, null, options.headerLeft?.());
  };

  return {
    Redirect: ({ href }: { href: string }) => React.createElement(View, { testID: `redirect-${href}` }),
    Stack: MockStack,
    useRouter: () => mockRouter,
  };
});

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('@/features/auth/session', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('@/shared/ui/LoadingScreen', () => ({
  LoadingScreen: () => null,
}));

// eslint-disable-next-line import/first
import { fireEvent, render, screen } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import TripsLayout from '../_layout';

describe('TripsLayout header actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({ status: 'signedIn', user: { requires_profile_setup: false } });
  });

  it('returns to the previous route from the trip detail header when history exists', async () => {
    mockRouter.canGoBack.mockReturnValue(true);

    await render(<TripsLayout />);
    await fireEvent.press(screen.getByLabelText('Back to Trips'));

    expect(screen.getByLabelText('Cancel trip creation')).toBeTruthy();
    expect(mockRouter.canGoBack).toHaveBeenCalledTimes(1);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('returns to tabs from the create header when there is no navigation history', async () => {
    mockRouter.canGoBack.mockReturnValue(false);

    await render(<TripsLayout />);
    await fireEvent.press(screen.getByLabelText('Cancel trip creation'));

    expect(mockRouter.canGoBack).toHaveBeenCalledTimes(1);
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('returns to the previous route from the create header when history exists', async () => {
    mockRouter.canGoBack.mockReturnValue(true);

    await render(<TripsLayout />);
    await fireEvent.press(screen.getByLabelText('Cancel trip creation'));

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('returns to tabs from the trip detail header when there is no navigation history', async () => {
    mockRouter.canGoBack.mockReturnValue(false);

    await render(<TripsLayout />);
    await fireEvent.press(screen.getByLabelText('Back to Trips'));

    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
  });
});
