import { StyleSheet, Text } from 'react-native';
import { colors, typography } from '@/shared/theme/tokens';
import { Screen } from '@/shared/ui/Screen';

export default function LoginScreen() {
  return (
    <Screen>
      <Text style={styles.placeholder}>Login will live here.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  placeholder: { ...typography.body, color: colors.textMuted },
});
