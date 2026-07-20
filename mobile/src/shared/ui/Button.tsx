import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radii, spacing, typography } from '@/shared/theme/tokens';

interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

export function Button({ title, onPress, loading = false, disabled = false, variant = 'primary' }: ButtonProps) {
  const blocked = disabled || loading;
  const showDisabledStyle = disabled && !loading;
  return (
    <Pressable
      testID="button-pressable"
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked }}
      onPress={blocked ? () => undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        pressed && variant === 'primary' && !blocked && styles.primaryPressed,
        showDisabledStyle && (variant === 'primary' ? styles.primaryDisabled : styles.secondaryDisabled),
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.background : colors.primary} />
      ) : (
        <Text
          style={[
            styles.text,
            variant === 'primary' ? styles.primaryText : styles.secondaryText,
            showDisabledStyle && styles.disabledText,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  primary: { backgroundColor: colors.primary },
  primaryPressed: { backgroundColor: colors.primaryPressed },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  primaryDisabled: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryDisabled: { backgroundColor: colors.surface },
  text: { ...typography.body, fontWeight: '600' },
  primaryText: { color: colors.background },
  secondaryText: { color: colors.text },
  disabledText: { color: colors.textMuted },
});
