import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useSession } from '@/features/auth/session';
import { colors } from '@/shared/theme/tokens';
import { LoadingScreen } from '@/shared/ui/LoadingScreen';

export default function TabsLayout() {
  const { status, user } = useSession();
  if (status === 'restoring') {
    return <LoadingScreen />;
  }
  if (status === 'signedOut') {
    return <Redirect href="/(auth)/login" />;
  }
  if (user?.requires_profile_setup) {
    return <Redirect href="/(auth)/profile-setup" />;
  }
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary, headerShown: true }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Trips',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="airplane-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
