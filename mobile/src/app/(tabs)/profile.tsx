import { StyleSheet, Text } from 'react-native';
import { colors, typography } from '@/shared/theme/tokens';
import { Screen } from '@/shared/ui/Screen';

export default function ProfileScreen() {
  return (
    <Screen>
      <Text style={styles.placeholder}>Profile will live here.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  placeholder: { ...typography.body, color: colors.textMuted },
});
