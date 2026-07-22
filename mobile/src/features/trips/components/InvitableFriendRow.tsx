import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '@/shared/theme/tokens';
import type { InvitableFriend } from '../types';

interface InvitableFriendRowProps {
  friend: InvitableFriend;
  selected: boolean;
  disabled: boolean;
  onToggle: (friendId: string) => void;
}

export const InvitableFriendRow = memo(function InvitableFriendRow({
  friend,
  selected,
  disabled,
  onToggle,
}: InvitableFriendRowProps) {
  const toggle = useCallback(() => {
    onToggle(friend.id);
  }, [friend.id, onToggle]);
  const initial = friend.display_name.trim().charAt(0).toUpperCase() || '?';

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={`Invite ${friend.display_name}`}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={toggle}
      style={({ pressed }) => [
        styles.row,
        selected ? styles.selectedRow : null,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <View style={styles.identity}>
        <Text style={styles.name} numberOfLines={1}>
          {friend.display_name}
        </Text>
        <Text style={styles.tag} numberOfLines={1}>
          {friend.identify_tag}
        </Text>
      </View>
      <View style={[styles.check, selected ? styles.selectedCheck : null]}>
        {selected ? <Ionicons name="checkmark" size={18} color={colors.background} /> : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.background,
  },
  selectedRow: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },
  avatar: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
    backgroundColor: colors.surface,
  },
  avatarText: { ...typography.label, color: colors.textMuted },
  identity: { flex: 1, minWidth: 0, gap: spacing.xs },
  name: { ...typography.body, color: colors.text, fontWeight: '600' },
  tag: { ...typography.caption, color: colors.textMuted },
  check: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    backgroundColor: colors.background,
  },
  selectedCheck: { borderColor: colors.primary, backgroundColor: colors.primary },
});
