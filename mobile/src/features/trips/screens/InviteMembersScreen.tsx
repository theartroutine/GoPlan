import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { FormError } from '@/shared/ui/FormError';
import { LoadingScreen } from '@/shared/ui/LoadingScreen';
import { InvitableFriendRow } from '../components/InvitableFriendRow';
import { useInviteMembers } from '../hooks/useInviteMembers';
import { useTripDetail } from '../hooks/useTripDetail';
import type { InvitableFriend } from '../types';

export function InviteMembersScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const tripDetail = useTripDetail(tripId);
  const canInvite = Boolean(
    tripDetail.detail?.my_membership.role === 'CAPTAIN' &&
      tripDetail.detail.my_membership.status === 'ACTIVE' &&
      (tripDetail.detail.trip.status === 'PLANNING' || tripDetail.detail.trip.status === 'ONGOING'),
  );
  const invite = useInviteMembers(tripId, canInvite);

  const close = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(`/trips/${tripId}`);
  }, [router, tripId]);

  const submitInvitations = invite.submit;
  const send = useCallback(async () => {
    if (await submitInvitations()) {
      close();
    }
  }, [close, submitInvitations]);

  const renderFriend = useCallback(
    ({ item }: { item: InvitableFriend }) => (
      <InvitableFriendRow
        friend={item}
        selected={invite.selectedIds.has(item.id)}
        disabled={invite.submitting}
        onToggle={invite.toggleSelection}
      />
    ),
    [invite.selectedIds, invite.submitting, invite.toggleSelection],
  );

  if (tripDetail.status === 'loading') {
    return <LoadingScreen />;
  }

  if (tripDetail.status === 'error' || !tripDetail.detail) {
    const notFound = tripDetail.error?.status === 404;
    return (
      <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
        <View style={styles.centered}>
          <Ionicons
            name={notFound ? 'help-circle-outline' : 'cloud-offline-outline'}
            size={44}
            color={colors.textMuted}
          />
          <Text style={styles.stateTitle}>{notFound ? 'Trip not found' : 'Could not load trip'}</Text>
          <Text style={styles.stateBody}>
            {notFound
              ? 'This trip does not exist or you are not a member of it.'
              : tripDetail.error?.message}
          </Text>
          {notFound ? null : (
            <Button title="Try again" onPress={() => void tripDetail.refresh('initial')} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (!canInvite) {
    return (
      <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={44} color={colors.textMuted} />
          <Text style={styles.stateTitle}>Invitations unavailable</Text>
          <Text style={styles.stateBody}>
            Only the captain can invite friends while this trip is active.
          </Text>
          <Button title="Back to trip" variant="secondary" onPress={close} />
        </View>
      </SafeAreaView>
    );
  }

  if (invite.status === 'loading' || invite.status === 'idle') {
    return <LoadingScreen />;
  }

  if (invite.status === 'error') {
    return (
      <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={44} color={colors.textMuted} />
          <Text style={styles.stateTitle}>Could not load eligible friends</Text>
          <Text style={styles.stateBody}>{invite.loadError?.message}</Text>
          <Button title="Try again" onPress={() => void invite.load('initial')} />
        </View>
      </SafeAreaView>
    );
  }

  const selectedCount = invite.selectedIds.size;
  const fieldError = invite.submitError?.fieldErrors?.invitee_ids;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <FlatList
        data={invite.items}
        keyExtractor={(friend) => friend.id}
        renderItem={renderFriend}
        extraData={invite.selectedIds}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={invite.items.length === 0 ? styles.emptyContent : styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              Choose friends
            </Text>
            <Text style={styles.stateBody}>
              Select up to 20 eligible friends. Active members and pending invitees are already excluded.
            </Text>
            <Text style={styles.selectionCount}>{selectedCount} selected</Text>
            {invite.loadError ? (
              <View accessibilityRole="alert" style={styles.inlineError}>
                <Text style={styles.inlineErrorText}>{invite.loadError.message}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry eligible friends"
                  onPress={() => void invite.load('silent')}
                  style={({ pressed }) => [styles.inlineRetry, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.inlineRetryText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={44} color={colors.textMuted} />
            <Text style={styles.stateTitle}>No eligible friends</Text>
            <Text style={styles.stateBody}>
              Everyone eligible is already a member or has a pending invitation.
            </Text>
          </View>
        }
      />
      <View style={styles.footer}>
        {invite.selectionError ? <Text style={styles.errorText}>{invite.selectionError}</Text> : null}
        {fieldError ? <Text style={styles.errorText}>{fieldError}</Text> : null}
        <FormError error={invite.submitError} />
        {selectedCount === 0 && !invite.selectionError ? (
          <Text style={styles.hint}>Select at least one friend to continue.</Text>
        ) : null}
        <Button
          title={selectedCount > 0 ? `Send invitations (${selectedCount})` : 'Send invitations'}
          onPress={() => void send()}
          loading={invite.submitting}
          disabled={selectedCount === 0}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  stateTitle: { ...typography.heading, color: colors.text, textAlign: 'center' },
  stateBody: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  listContent: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  emptyContent: { flexGrow: 1, padding: spacing.md },
  header: { gap: spacing.sm, paddingBottom: spacing.sm },
  title: { ...typography.heading, color: colors.text },
  selectionCount: { ...typography.label, color: colors.primary },
  inlineError: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerSoft,
  },
  inlineErrorText: { ...typography.caption, color: colors.danger, flex: 1 },
  inlineRetry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  inlineRetryText: { ...typography.label, color: colors.danger },
  pressed: { opacity: 0.55 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  footer: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  errorText: { ...typography.caption, color: colors.danger },
  hint: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
});
