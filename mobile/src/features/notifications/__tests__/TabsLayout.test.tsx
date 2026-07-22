const mockUseSession = jest.fn();
const mockUnreadCount = jest.fn();
const mockTabsScreen = jest.fn();
const mockProviderOwner = jest.fn();

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  function MockTabs({ children }: { children: import('react').ReactNode }) {
    return React.createElement(View, null, children);
  }
  MockTabs.Screen = function MockTabsScreen({ name, options }: { name: string; options: Record<string, unknown> }) {
    mockTabsScreen(name, options);
    return null;
  };
  return {
    Redirect: ({ href }: { href: string }) => React.createElement(View, { testID: `redirect-${href}` }),
    Tabs: MockTabs,
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/features/auth/session', () => ({ useSession: () => mockUseSession() }));
jest.mock('../application/NotificationsProvider', () => ({
  NotificationsProvider: ({ children, ownerUserId }: { children: import('react').ReactNode; ownerUserId: string }) => {
    mockProviderOwner(ownerUserId);
    return children;
  },
  useNotifications: () => ({ unreadCount: mockUnreadCount() }),
}));
jest.mock('@/shared/ui/LoadingScreen', () => ({ LoadingScreen: () => null }));

// eslint-disable-next-line import/first
import { render } from '@testing-library/react-native';
// eslint-disable-next-line import/first
import TabsLayout from '@/app/(tabs)/_layout';

function notificationsOptions(): Record<string, unknown> {
  const call = mockTabsScreen.mock.calls.find(([name]) => name === 'notifications');
  if (!call) {
    throw new Error('Expected the Notifications tab to be registered.');
  }
  return call[1] as Record<string, unknown>;
}

describe('TabsLayout notifications integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({
      status: 'signedIn',
      user: { id: 'user-1', requires_profile_setup: false },
    });
  });

  it('scopes the provider to the authenticated user and caps a large unread badge', async () => {
    mockUnreadCount.mockReturnValue(120);
    await render(<TabsLayout />);

    expect(mockProviderOwner).toHaveBeenCalledWith('user-1');
    expect(notificationsOptions()).toEqual(
      expect.objectContaining({ headerShown: false, tabBarBadge: '99+' }),
    );
  });

  it.each([0, null])('hides the badge for unread count %s', async (count) => {
    mockUnreadCount.mockReturnValue(count);
    await render(<TabsLayout />);
    expect(notificationsOptions().tabBarBadge).toBeUndefined();
  });
});
