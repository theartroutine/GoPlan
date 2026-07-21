import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { resolveMediaUrl } from '@/shared/api/base-url';
import { colors, spacing, typography } from '@/shared/theme/tokens';
import type { TripMember } from '../types';

const AVATAR_SIZE = 40;

export function MemberRow({ member, showDivider = false }: { member: TripMember; showDivider?: boolean }) {
  const avatarUrl = resolveMediaUrl(member.user.avatar_url);
  const initial = member.user.display_name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View style={[styles.row, showDivider && styles.divider]}>
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
    </View>
  );
}

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
});
