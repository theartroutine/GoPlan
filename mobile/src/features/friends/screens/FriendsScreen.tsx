import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { LoadingScreen } from '@/shared/ui/LoadingScreen';
import { FriendRow } from '../components/FriendRow';
import { useFriendsList } from '../hooks/useFriendsList';
import type { Friend } from '../types';

interface HeaderActionProps {
  icon: 'person-add-outline' | 'mail-outline';
  label: string;
  onPress: () => void;
}

function HeaderAction({ icon, label, onPress }: HeaderActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={spacing.xs}
      onPress={onPress}
      style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={21} color={colors.primary} />
      <Text style={styles.headerActionText}>{label}</Text>
    </Pressable>
  );
}

function FriendsHeader({ onAdd, onRequests }: { onAdd: () => void; onRequests: () => void }) {
  return (
    <View style={styles.screenHeader}>
      <Text accessibilityRole="header" style={styles.screenTitle}>
        Friends
      </Text>
      <View style={styles.headerActions}>
        <HeaderAction icon="person-add-outline" label="Add Friend" onPress={onAdd} />
        <HeaderAction icon="mail-outline" label="Requests" onPress={onRequests} />
      </View>
    </View>
  );
}

export function FriendsScreen() {
  const router = useRouter();
  const {
    items,
    status,
    error,
    errorSource,
    refreshing,
    loadingMore,
    loadFirstPage,
    loadMore,
    removingIds,
    mutationError,
    removeFriend,
    clearMutationError,
  } = useFriendsList();
  const loadedOnceRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      clearMutationError();
      void loadFirstPage(loadedOnceRef.current ? 'silent' : 'initial');
      loadedOnceRef.current = true;
    }, [clearMutationError, loadFirstPage]),
  );

  const openAddFriend = useCallback(() => router.push('/friends/add'), [router]);
  const openRequests = useCallback(() => router.push('/friends/requests'), [router]);
  const refreshFriends = useCallback(() => {
    clearMutationError();
    void loadFirstPage('refresh');
  }, [clearMutationError, loadFirstPage]);
  const autoLoadMore = useCallback(() => {
    if (errorSource !== 'loadMore') {
      void loadMore();
    }
  }, [errorSource, loadMore]);

  const confirmRemove = useCallback(
    (friendshipId: string, displayName: string) => {
      Alert.alert(
        'Remove friend',
        `Remove ${displayName} from your friends?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              void removeFriend(friendshipId);
            },
          },
        ],
      );
    },
    [removeFriend],
  );

  const renderItem = useCallback(
    ({ item }: { item: Friend }) => (
      <FriendRow
        friendshipId={item.friendship_id}
        displayName={item.user.display_name}
        identifyTag={item.user.identify_tag}
        avatarUrl={item.user.avatar_url}
        removing={removingIds.has(item.friendship_id)}
        onRemoveRequest={confirmRemove}
      />
    ),
    [confirmRemove, removingIds],
  );

  const header = <FriendsHeader onAdd={openAddFriend} onRequests={openRequests} />;

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <LoadingScreen />
      </SafeAreaView>
    );
  }

  if (status === 'error') {
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={44} color={colors.textMuted} />
          <Text style={styles.stateTitle}>Could not load friends</Text>
          <Text style={styles.stateBody}>{error?.message}</Text>
          <Button title="Try again" onPress={() => void loadFirstPage('initial')} />
        </View>
      </SafeAreaView>
    );
  }

  const inlineError = mutationError ?? (errorSource === 'refresh' ? error : null);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {header}
      {inlineError ? (
        <View accessibilityRole="alert" style={styles.inlineError}>
          <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
          <Text style={styles.inlineErrorText}>{inlineError.message}</Text>
          {!mutationError ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry refreshing friends"
              onPress={refreshFriends}
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <FlatList
        style={styles.list}
        data={items}
        keyExtractor={(item) => item.friendship_id}
        renderItem={renderItem}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.listContent}
        onRefresh={refreshFriends}
        refreshing={refreshing}
        onEndReached={autoLoadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={44} color={colors.textMuted} />
            <Text style={styles.stateTitle}>No friends yet</Text>
            <Text style={styles.stateBody}>Find someone by their identify tag to start planning together.</Text>
            <Button title="Add your first friend" onPress={openAddFriend} />
          </View>
        }
        ListFooterComponent={
          errorSource === 'loadMore' && error ? (
            <View accessibilityRole="alert" style={styles.footerError}>
              <Text style={styles.footerErrorText}>{error.message}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry loading more friends"
                onPress={() => void loadMore()}
                style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : loadingMore ? (
            <ActivityIndicator style={styles.footerSpinner} color={colors.primary} />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  screenHeader: {
    minHeight: 66,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  screenTitle: { ...typography.largeTitle, color: colors.text },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  headerAction: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderCurve: 'continuous',
    backgroundColor: colors.primarySoft,
  },
  headerActionText: { ...typography.label, color: colors.primary },
  pressed: { opacity: 0.55 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  emptyState: { alignItems: 'center', gap: spacing.md },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  stateTitle: { ...typography.heading, color: colors.text },
  stateBody: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  inlineError: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radii.md,
    borderCurve: 'continuous',
    backgroundColor: colors.dangerSoft,
  },
  inlineErrorText: { ...typography.caption, color: colors.danger, flex: 1 },
  retryButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  retryText: { ...typography.label, color: colors.danger },
  footerSpinner: { marginVertical: spacing.md },
  footerError: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md },
  footerErrorText: { ...typography.caption, color: colors.danger, textAlign: 'center' },
});
