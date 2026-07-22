import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { LoadingScreen } from '@/shared/ui/LoadingScreen';
import { FriendRequestRow } from '../components/FriendRequestRow';
import { useFriendRequests } from '../hooks/useFriendRequests';
import type { FriendRequest } from '../types';

type RequestTab = 'incoming' | 'outgoing';

export function FriendRequestsScreen() {
  const {
    incoming,
    outgoing,
    pendingActions,
    mutationError,
    performAction,
    loadFirstPages,
    clearMutationError,
  } = useFriendRequests();
  const [tab, setTab] = useState<RequestTab>('incoming');
  const loadedOnceRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      clearMutationError();
      void loadFirstPages(loadedOnceRef.current ? 'silent' : 'initial');
      loadedOnceRef.current = true;
    }, [clearMutationError, loadFirstPages]),
  );

  const current = tab === 'incoming' ? incoming : outgoing;
  const loadCurrentFirstPage = current.loadFirstPage;
  const loadCurrentMore = current.loadMore;
  const currentErrorSource = current.errorSource;
  const changeTab = useCallback(
    (nextTab: RequestTab) => {
      clearMutationError();
      setTab(nextTab);
    },
    [clearMutationError],
  );
  const refreshCurrent = useCallback(() => {
    clearMutationError();
    void loadCurrentFirstPage('refresh');
  }, [clearMutationError, loadCurrentFirstPage]);
  const retryInitial = useCallback(() => {
    clearMutationError();
    void loadCurrentFirstPage('initial');
  }, [clearMutationError, loadCurrentFirstPage]);
  const autoLoadCurrentMore = useCallback(() => {
    if (currentErrorSource !== 'loadMore') {
      void loadCurrentMore();
    }
  }, [currentErrorSource, loadCurrentMore]);

  const renderItem = useCallback(
    ({ item }: { item: FriendRequest }) => {
      const user = tab === 'incoming' ? item.sender : item.receiver;
      return (
        <FriendRequestRow
          requestId={item.id}
          displayName={user.display_name}
          identifyTag={user.identify_tag}
          avatarUrl={user.avatar_url}
          direction={tab}
          pendingAction={pendingActions.get(item.id) ?? null}
          onAction={performAction}
        />
      );
    },
    [pendingActions, performAction, tab],
  );

  if (current.status === 'loading') {
    return (
      <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
        <RequestTabs tab={tab} onChange={changeTab} />
        <LoadingScreen />
      </SafeAreaView>
    );
  }

  if (current.status === 'error') {
    return (
      <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
        <RequestTabs tab={tab} onChange={changeTab} />
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={44} color={colors.textMuted} />
          <Text style={styles.stateTitle}>Could not load requests</Text>
          <Text style={styles.stateBody}>{current.error?.message}</Text>
          <Button title="Try again" onPress={retryInitial} />
        </View>
      </SafeAreaView>
    );
  }

  const refreshError = current.errorSource === 'refresh' ? current.error : null;
  const inlineError = mutationError ?? refreshError;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <RequestTabs tab={tab} onChange={changeTab} />
      {inlineError ? (
        <View accessibilityRole="alert" style={styles.inlineError}>
          <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
          <Text style={styles.inlineErrorText}>{inlineError.message}</Text>
          {!mutationError ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Retry refreshing ${tab} requests`}
              onPress={refreshCurrent}
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <FlatList
        key={tab}
        style={styles.list}
        data={current.items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={current.items.length === 0 ? styles.emptyContainer : styles.listContent}
        onRefresh={refreshCurrent}
        refreshing={current.refreshing}
        onEndReached={autoLoadCurrentMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="mail-open-outline" size={44} color={colors.textMuted} />
            <Text style={styles.stateTitle}>No {tab} requests</Text>
            <Text style={styles.stateBody}>
              {tab === 'incoming'
                ? 'New requests from other people will appear here.'
                : 'Friend requests you send will appear here.'}
            </Text>
          </View>
        }
        ListFooterComponent={
          current.errorSource === 'loadMore' && current.error ? (
            <View accessibilityRole="alert" style={styles.footerError}>
              <Text style={styles.footerErrorText}>{current.error.message}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Retry loading more ${tab} requests`}
                onPress={() => void loadCurrentMore()}
                style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : current.loadingMore ? (
            <ActivityIndicator style={styles.footerSpinner} color={colors.primary} />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function RequestTabs({ tab, onChange }: { tab: RequestTab; onChange: (tab: RequestTab) => void }) {
  return (
    <View style={styles.tabs}>
      {(['incoming', 'outgoing'] as const).map((value) => {
        const selected = tab === value;
        const label = value === 'incoming' ? 'Incoming' : 'Outgoing';
        return (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`${label} requests`}
            accessibilityState={{ selected }}
            onPress={() => onChange(value)}
            style={({ pressed }) => [styles.tab, selected && styles.tabSelected, pressed && styles.pressed]}
          >
            <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  tabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    margin: spacing.md,
    padding: spacing.xs,
    borderRadius: radii.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  tab: {
    minHeight: 44,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    borderCurve: 'continuous',
  },
  tabSelected: { backgroundColor: colors.background },
  tabText: { ...typography.label, color: colors.textMuted },
  tabTextSelected: { color: colors.primary },
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
  stateTitle: { ...typography.heading, color: colors.text, textTransform: 'none' },
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
