import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/shared/theme/tokens';
import type { TripInvitation } from '../types';

const invitationDateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : invitationDateFormatter.format(date);
}

export const PendingInvitationRow = memo(function PendingInvitationRow({
  invitation,
  showDivider = false,
}: {
  invitation: TripInvitation;
  showDivider?: boolean;
}) {
  return (
    <View style={[styles.row, showDivider ? styles.divider : null]}>
      <View style={styles.identity}>
        <Text style={styles.name} numberOfLines={1}>
          {invitation.invitee.display_name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {invitation.invitee.identify_tag}
        </Text>
        <Text style={styles.meta}>Invited {formatCreatedAt(invitation.created_at)}</Text>
      </View>
      <Text style={styles.status}>Pending</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  identity: { flex: 1, minWidth: 0, gap: spacing.xs },
  name: { ...typography.body, color: colors.text, fontWeight: '600' },
  meta: { ...typography.caption, color: colors.textMuted },
  status: { ...typography.label, color: colors.primary },
});
