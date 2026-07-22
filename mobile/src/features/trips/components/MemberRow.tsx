import { Image } from 'expo-image';
import { memo, useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { resolveMediaUrl } from '@/shared/api/base-url';
import { colors, radii, spacing, typography } from '@/shared/theme/tokens';
import type { TripMember } from '../types';

const AVATAR_SIZE = 40;

interface MemberRowProps {
  member: TripMember;
  showDivider?: boolean;
  showRemove?: boolean;
  removeDisabled?: boolean;
  removing?: boolean;
  onRemoveRequest?: (userId: string, displayName: string) => void;
}

export const MemberRow = memo(function MemberRow({
  member,
  showDivider = false,
  showRemove = false,
  removeDisabled = false,
  removing = false,
  onRemoveRequest,
}: MemberRowProps) {
  const avatarUrl = resolveMediaUrl(member.user.avatar_url);
  const initial = member.user.display_name.trim().charAt(0).toUpperCase() || '?';
  const requestRemoval = useCallback(() => {
    onRemoveRequest?.(member.user.id, member.user.display_name);
  }, [member.user.display_name, member.user.id, onRemoveRequest]);
  const removeBlocked = removeDisabled || removing;

  return (
    <View style={[styles.row, showDivider ? styles.divider : null]}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {member.user.display_name}
        </Text>
        <Text style={styles.tag} numberOfLines={1}>
          {member.user.identify_tag}
        </Text>
      </View>
      <Text style={styles.role}>{member.role === 'CAPTAIN' ? 'Captain' : 'Member'}</Text>
      {showRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${member.user.display_name} from trip`}
          accessibilityState={{ disabled: removeBlocked, busy: removing }}
          disabled={removeBlocked}
          hitSlop={spacing.xs}
          onPress={requestRemoval}
          style={({ pressed }) => [
            styles.removeButton,
            pressed && !removeBlocked ? styles.removePressed : null,
            removeBlocked ? styles.removeDisabled : null,
          ]}
        >
          {removing ? (
            <ActivityIndicator size="small" color={colors.danger} />
          ) : (
            <Text style={styles.removeText}>Remove</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 },
  avatarFallback: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { ...typography.label, color: colors.textMuted },
  info: { flex: 1, minWidth: 0, gap: spacing.xs },
  name: { ...typography.body, color: colors.text },
  tag: { ...typography.caption, color: colors.textMuted },
  role: { ...typography.label, color: colors.textMuted, flexShrink: 0 },
  removeButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoft,
  },
  removePressed: { opacity: 0.55 },
  removeDisabled: { opacity: 0.5 },
  removeText: { ...typography.label, color: colors.danger },
});
