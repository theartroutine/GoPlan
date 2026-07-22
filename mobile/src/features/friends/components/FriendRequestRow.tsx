import { memo, useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '@/shared/theme/tokens';
import { FriendAvatar } from './FriendAvatar';

export type FriendRequestDirection = 'incoming' | 'outgoing';
export type FriendRequestAction = 'accept' | 'decline' | 'cancel';

export interface FriendRequestRowProps {
  requestId: string;
  displayName: string;
  identifyTag: string;
  avatarUrl: string | null;
  direction: FriendRequestDirection;
  pendingAction: FriendRequestAction | null;
  onAction: (requestId: string, action: FriendRequestAction) => void;
}

interface RequestActionButtonProps {
  requestId: string;
  action: FriendRequestAction;
  title: string;
  accessibilityLabel: string;
  primary?: boolean;
  loading: boolean;
  disabled: boolean;
  onAction: (requestId: string, action: FriendRequestAction) => void;
}

const RequestActionButton = memo(function RequestActionButton({
  requestId,
  action,
  title,
  accessibilityLabel,
  primary = false,
  loading,
  disabled,
  onAction,
}: RequestActionButtonProps) {
  const pressAction = useCallback(() => {
    onAction(requestId, action);
  }, [action, onAction, requestId]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      onPress={pressAction}
      style={({ pressed }) => [
        styles.actionButton,
        primary ? styles.primaryAction : styles.secondaryAction,
        pressed && !disabled && styles.actionPressed,
        disabled && !loading && styles.actionDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.background : colors.primary} />
      ) : (
        <Text style={[styles.actionText, primary ? styles.primaryActionText : styles.secondaryActionText]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
});

export const FriendRequestRow = memo(function FriendRequestRow({
  requestId,
  displayName,
  identifyTag,
  avatarUrl,
  direction,
  pendingAction,
  onAction,
}: FriendRequestRowProps) {
  const blocked = pendingAction !== null;

  return (
    <View style={styles.row}>
      <View style={styles.identityRow}>
        <FriendAvatar displayName={displayName} identifyTag={identifyTag} avatarUrl={avatarUrl} />
        <View style={styles.identity}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.identifyTag} numberOfLines={1}>
            {identifyTag}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        {direction === 'incoming' ? (
          <>
            <RequestActionButton
              requestId={requestId}
              action="accept"
              title="Accept"
              accessibilityLabel={`Accept ${displayName}`}
              primary
              loading={pendingAction === 'accept'}
              disabled={blocked}
              onAction={onAction}
            />
            <RequestActionButton
              requestId={requestId}
              action="decline"
              title="Decline"
              accessibilityLabel={`Decline ${displayName}`}
              loading={pendingAction === 'decline'}
              disabled={blocked}
              onAction={onAction}
            />
          </>
        ) : (
          <RequestActionButton
            requestId={requestId}
            action="cancel"
            title="Cancel Request"
            accessibilityLabel={`Cancel request to ${displayName}`}
            loading={pendingAction === 'cancel'}
            disabled={blocked}
            onAction={onAction}
          />
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.background,
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  identity: { flex: 1, minWidth: 0, gap: spacing.xs },
  name: { ...typography.body, color: colors.text, fontWeight: '600' },
  identifyTag: { ...typography.caption, color: colors.textMuted },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  actionButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radii.md,
    borderCurve: 'continuous',
  },
  primaryAction: { borderColor: colors.primary, backgroundColor: colors.primary },
  secondaryAction: { borderColor: colors.border, backgroundColor: colors.background },
  actionPressed: { opacity: 0.65 },
  actionDisabled: { opacity: 0.45 },
  actionText: { ...typography.label },
  primaryActionText: { color: colors.background },
  secondaryActionText: { color: colors.text },
});
