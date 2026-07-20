import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '@/shared/theme/tokens';
import type { TripStatus } from '../types';

const STATUS_META: Record<TripStatus, { label: string; color: string; backgroundColor: string }> = {
  PLANNING: { label: 'Planning', color: colors.primary, backgroundColor: colors.primarySoft },
  ONGOING: { label: 'Ongoing', color: colors.success, backgroundColor: colors.successSoft },
  COMPLETED: { label: 'Completed', color: colors.completedText, backgroundColor: colors.completedSoft },
  CANCELLED: { label: 'Cancelled', color: colors.danger, backgroundColor: colors.dangerSoft },
};

export function StatusBadge({ status }: { status: TripStatus }) {
  const meta = STATUS_META[status];
  return (
    <View style={[styles.badge, { backgroundColor: meta.backgroundColor }]}>
      <Text style={[styles.text, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  text: { ...typography.label },
});
