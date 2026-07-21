import { useCallback, useEffect, useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '@/shared/theme/tokens';
import type { MyMembership, Trip, TripAction, TripStatus } from '../types';

export type TripDisplayAction = TripAction | 'edit';

interface TripActionsProps {
  trip: Pick<Trip, 'status'>;
  membership: Pick<MyMembership, 'role' | 'status'> | null;
  isMutating: boolean;
  onAction: (action: TripDisplayAction) => void | Promise<void>;
}

interface ActionMeta {
  label: string;
  tone: 'primary' | 'secondary' | 'danger';
  confirmation?: { title: string; message: string; confirmLabel: string };
}

const ACTION_META: Record<TripDisplayAction, ActionMeta> = {
  edit: { label: 'Edit trip', tone: 'secondary' },
  start: { label: 'Start trip', tone: 'primary' },
  complete: {
    label: 'Complete trip',
    tone: 'primary',
    confirmation: {
      title: 'Complete this trip?',
      message: 'This marks the trip as completed. You cannot change it back.',
      confirmLabel: 'Complete trip',
    },
  },
  cancel: {
    label: 'Cancel trip',
    tone: 'danger',
    confirmation: {
      title: 'Cancel this trip?',
      message: 'This cancels the trip for every member. You cannot change it back.',
      confirmLabel: 'Cancel trip',
    },
  },
  leave: {
    label: 'Leave trip',
    tone: 'danger',
    confirmation: {
      title: 'Leave this trip?',
      message: 'You will no longer be able to access this trip unless you are invited again.',
      confirmLabel: 'Leave trip',
    },
  },
};

export function getTripDisplayActions(
  status: TripStatus,
  membership: Pick<MyMembership, 'role' | 'status'> | null,
): TripDisplayAction[] {
  if (membership?.status !== 'ACTIVE') {
    return [];
  }

  if (membership.role === 'CAPTAIN') {
    if (status === 'PLANNING') {
      return ['edit', 'start', 'cancel'];
    }
    if (status === 'ONGOING') {
      return ['edit', 'complete', 'cancel'];
    }
    return [];
  }

  if (status === 'PLANNING' || status === 'ONGOING') {
    return ['leave'];
  }

  return [];
}

export function TripActions({ trip, membership, isMutating, onAction }: TripActionsProps) {
  const actionLockRef = useRef(false);
  const actions = getTripDisplayActions(trip.status, membership);

  useEffect(() => {
    if (!isMutating) {
      actionLockRef.current = false;
    }
  }, [isMutating]);

  const releaseLock = useCallback(() => {
    actionLockRef.current = false;
  }, []);

  const runAction = useCallback(
    (action: TripDisplayAction) => {
      try {
        void Promise.resolve(onAction(action)).finally(releaseLock);
      } catch (error) {
        releaseLock();
        throw error;
      }
    },
    [onAction, releaseLock],
  );

  const dispatch = useCallback(
    (action: TripDisplayAction) => {
      if (isMutating || actionLockRef.current) {
        return;
      }

      actionLockRef.current = true;
      const confirmation = ACTION_META[action].confirmation;
      if (confirmation) {
        Alert.alert(
          confirmation.title,
          confirmation.message,
          [
            { text: 'Keep trip', style: 'cancel', onPress: releaseLock },
            {
              text: confirmation.confirmLabel,
              style: 'destructive',
              onPress: () => runAction(action),
            },
          ],
          { cancelable: true, onDismiss: releaseLock },
        );
        return;
      }

      runAction(action);
    },
    [isMutating, releaseLock, runAction],
  );

  if (actions.length === 0) {
    return null;
  }

  return (
    <View accessibilityLabel="Trip actions" style={styles.container}>
      {actions.map((action) => {
        const meta = ACTION_META[action];
        const disabled = isMutating;
        return (
          <Pressable
            key={action}
            accessibilityRole="button"
            accessibilityLabel={meta.label}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => dispatch(action)}
            style={({ pressed }) => [
              styles.button,
              meta.tone === 'primary' && styles.primaryButton,
              meta.tone === 'secondary' && styles.secondaryButton,
              meta.tone === 'danger' && styles.dangerButton,
              pressed && !disabled && styles.pressed,
              disabled && styles.disabledButton,
            ]}
          >
            <Text
              style={[
                styles.buttonText,
                meta.tone === 'primary' && styles.primaryText,
                meta.tone === 'secondary' && styles.secondaryText,
                meta.tone === 'danger' && styles.dangerText,
                disabled && styles.disabledText,
              ]}
            >
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
  },
  primaryButton: { backgroundColor: colors.primary },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  dangerButton: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.dangerBorder },
  pressed: { opacity: 0.82 },
  disabledButton: { backgroundColor: colors.surface, borderColor: colors.border },
  buttonText: { ...typography.body, fontWeight: '600' },
  primaryText: { color: colors.background },
  secondaryText: { color: colors.text },
  dangerText: { color: colors.danger },
  disabledText: { color: colors.textMuted },
});
