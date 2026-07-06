import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { Screen } from '@/shared/ui/Screen';
import { useSession } from '../session';

export function ProfileScreen() {
  const { user, signOut } = useSession();
  if (!user) {
    return null;
  }
  // Backend's identify_tag is already the full "identify_name#identify_code" value.
  const identify = user.identify_tag;
  return (
    <Screen>
      <View style={styles.card}>
        <Text style={styles.name}>{user.display_name || user.email}</Text>
        <Text style={styles.detail}>{user.email}</Text>
        {identify ? <Text style={styles.detail}>{identify}</Text> : null}
      </View>
      <Button title="Log out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  name: { ...typography.heading, color: colors.text },
  detail: { ...typography.body, color: colors.textMuted },
});
