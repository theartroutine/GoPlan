import { Ionicons } from '@expo/vector-icons';
import { Redirect, Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSession } from '@/features/auth/session';
import { colors, spacing, typography } from '@/shared/theme/tokens';
import { LoadingScreen } from '@/shared/ui/LoadingScreen';

function HeaderCancelAction({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Cancel adding a friend"
      hitSlop={spacing.sm}
      onPress={onPress}
      style={({ pressed }) => [styles.headerAction, pressed && styles.headerActionPressed]}
    >
      <Text style={styles.headerActionText}>Cancel</Text>
    </Pressable>
  );
}

function HeaderBackAction({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to Friends"
      hitSlop={spacing.sm}
      onPress={onPress}
      style={({ pressed }) => [styles.headerAction, pressed && styles.headerActionPressed]}
    >
      <Ionicons name="chevron-back" size={22} color={colors.primary} />
      <Text style={styles.headerActionText}>Friends</Text>
    </Pressable>
  );
}

export default function FriendsLayout() {
  const router = useRouter();
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

  const leaveFriendsRoute = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/friends');
  };

  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen
        name="add"
        options={{
          title: 'Add Friend',
          presentation: 'modal',
          headerLeft: () => <HeaderCancelAction onPress={leaveFriendsRoute} />,
        }}
      />
      <Stack.Screen
        name="requests"
        options={{
          title: 'Friend Requests',
          headerLeft: () => <HeaderBackAction onPress={leaveFriendsRoute} />,
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  headerAction: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  headerActionPressed: { opacity: 0.55 },
  headerActionText: { ...typography.body, color: colors.primary },
});
