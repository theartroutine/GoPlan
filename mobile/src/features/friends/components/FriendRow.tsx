import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '@/shared/theme/tokens';
import { FriendAvatar } from './FriendAvatar';

export interface FriendRowProps {
  friendshipId: string;
  displayName: string;
  identifyTag: string;
  avatarUrl: string | null;
  removing: boolean;
  onRemoveRequest: (friendshipId: string, displayName: string) => void;
}

export const FriendRow = memo(function FriendRow({
  friendshipId,
  displayName,
  identifyTag,
  avatarUrl,
  removing,
  onRemoveRequest,
}: FriendRowProps) {
  const requestRemoval = useCallback(() => {
    onRemoveRequest(friendshipId, displayName);
  }, [displayName, friendshipId, onRemoveRequest]);

  return (
    <View style={styles.row}>
      <FriendAvatar displayName={displayName} identifyTag={identifyTag} avatarUrl={avatarUrl} />
      <View style={styles.identity}>
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.identifyTag} numberOfLines={1}>
          {identifyTag}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${displayName}`}
        accessibilityState={{ disabled: removing, busy: removing }}
        disabled={removing}
        hitSlop={spacing.xs}
        onPress={requestRemoval}
        style={({ pressed }) => [styles.removeButton, pressed && !removing && styles.removeButtonPressed]}
      >
        {removing ? (
          <ActivityIndicator color={colors.danger} />
        ) : (
          <Ionicons name="person-remove-outline" size={22} color={colors.danger} />
        )}
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: spacing.xl * 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.background,
  },
  identity: { flex: 1, minWidth: 0, gap: spacing.xs },
  name: { ...typography.body, color: colors.text, fontWeight: '600' },
  identifyTag: { ...typography.caption, color: colors.textMuted },
  removeButton: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft,
  },
  removeButtonPressed: { opacity: 0.55 },
});
