import { DatePicker, Host } from '@expo/ui/swift-ui';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '@/shared/theme/tokens';

interface DateFieldProps {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  error?: string;
}

export function DateField({ label, value, onChange, minimumDate, error }: DateFieldProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, error ? styles.fieldError : null]}>
        <Ionicons name="calendar-outline" size={20} color={colors.textMuted} />
        <Host matchContents colorScheme="light" style={styles.picker}>
          <DatePicker
            selection={value}
            onDateChange={onChange}
            displayedComponents={['date']}
            range={minimumDate ? { start: minimumDate } : undefined}
          />
        </Host>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { ...typography.label, color: colors.text },
  field: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.background,
  },
  fieldError: { borderColor: colors.danger },
  picker: { minHeight: 40 },
  error: { ...typography.caption, color: colors.danger },
});
