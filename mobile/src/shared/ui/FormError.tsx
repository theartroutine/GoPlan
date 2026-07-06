import { StyleSheet, Text } from 'react-native';
import type { ApiError } from '@/shared/api/errors';
import { colors, typography } from '@/shared/theme/tokens';

export function FormError({ error }: { error: ApiError | null }) {
  if (!error || error.kind === 'field') {
    return null;
  }
  return <Text style={styles.text}>{error.message}</Text>;
}

const styles = StyleSheet.create({
  text: { ...typography.body, color: colors.danger },
});
