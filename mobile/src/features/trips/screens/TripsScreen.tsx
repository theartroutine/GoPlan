import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { LoadingScreen } from '@/shared/ui/LoadingScreen';
import { TripCard } from '../components/TripCard';
import { useTripsList } from '../hooks/useTripsList';
import type { TripListItem } from '../types';

function TripsHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <View style={styles.screenHeader}>
      <Text accessibilityRole="header" style={styles.screenTitle}>
        Trips
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create trip"
        onPress={onCreate}
        style={({ pressed }) => [styles.headerAddButton, pressed && styles.headerAddButtonPressed]}
      >
        <Ionicons name="add" size={26} color={colors.primary} />
      </Pressable>
    </View>
  );
}

export function TripsScreen() {
  const router = useRouter();
  const { items, status, error, refreshing, loadingMore, loadFirstPage, loadMore } = useTripsList();
  const loadedOnceRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      // First focus does a full load; later focuses re-sync silently (e.g. after creating a trip).
      void loadFirstPage(loadedOnceRef.current ? 'silent' : 'initial');
      loadedOnceRef.current = true;
    }, [loadFirstPage]),
  );

  const openTrip = useCallback(
    (tripId: string) => {
      router.push(`/trips/${tripId}`);
    },
    [router],
  );

  const openCreate = useCallback(() => {
    router.push('/trips/create');
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: TripListItem }) => <TripCard trip={item} onPress={openTrip} />,
    [openTrip],
  );

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.safe}>
        <TripsHeader onCreate={openCreate} />
        <LoadingScreen />
      </SafeAreaView>
    );
  }

  if (status === 'error') {
    return (
      <SafeAreaView style={styles.safe}>
        <TripsHeader onCreate={openCreate} />
        <View style={styles.stateCentered}>
          <Text style={styles.emptyTitle}>Could not load trips</Text>
          <Text style={styles.emptyBody}>{error?.message}</Text>
          <Button title="Try again" onPress={() => void loadFirstPage('initial')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <TripsHeader onCreate={openCreate} />
      {error ? (
        <View accessibilityRole="alert" style={styles.inlineError}>
          <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
          <Text style={styles.inlineErrorText}>{error.message}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading trips"
            hitSlop={spacing.sm}
            onPress={() => void loadFirstPage('refresh')}
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
      <FlatList
        style={styles.list}
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.listContent}
        onRefresh={() => void loadFirstPage('refresh')}
        refreshing={refreshing}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Ionicons name="airplane-outline" size={44} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No trips yet</Text>
            <Text style={styles.emptyBody}>Plan your first trip and invite your friends.</Text>
            <Button title="Create your first trip" onPress={openCreate} />
          </View>
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={colors.primary} /> : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  screenHeader: {
    minHeight: 57,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  screenTitle: { ...typography.largeTitle, color: colors.text },
  headerAddButton: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  headerAddButtonPressed: { backgroundColor: colors.surface },
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  centered: { alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  stateCentered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  inlineError: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoft,
  },
  inlineErrorText: { ...typography.caption, color: colors.danger, flex: 1 },
  retryButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  retryButtonPressed: { opacity: 0.55 },
  retryText: { ...typography.label, color: colors.danger },
  emptyTitle: { ...typography.heading, color: colors.text },
  emptyBody: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  footerSpinner: { marginVertical: spacing.md },
});
