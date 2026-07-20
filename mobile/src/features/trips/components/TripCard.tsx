import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { resolveMediaUrl } from '@/shared/api/base-url';
import { colors, radii, spacing, typography } from '@/shared/theme/tokens';
import { formatDateRange } from '../dates';
import type { TripListItem } from '../types';
import { StatusBadge } from './StatusBadge';

interface TripCardProps {
  trip: TripListItem;
  onPress: (tripId: string) => void;
}

export const TripCard = memo(function TripCard({ trip, onPress }: TripCardProps) {
  const coverUrl = resolveMediaUrl(trip.cover_image_url || null);
  const memberLabel = trip.member_count === 1 ? '1 member' : `${trip.member_count} members`;
  const roleLabel =
    trip.my_role === 'CAPTAIN' ? 'Captain' : trip.my_role === 'MEMBER' ? 'Member' : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open trip ${trip.name}`}
      onPress={() => onPress(trip.id)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {coverUrl ? (
        <Image source={{ uri: coverUrl }} style={styles.cover} contentFit="cover" transition={150} />
      ) : null}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          {coverUrl ? null : (
            <View style={styles.coverFallback}>
              <Ionicons name="airplane-outline" size={20} color={colors.primary} />
            </View>
          )}
          <View style={styles.titleText}>
            <Text style={styles.name} numberOfLines={1}>
              {trip.name}
            </Text>
            <Text style={styles.destination} numberOfLines={1}>
              {trip.destination}
            </Text>
          </View>
          <StatusBadge status={trip.status} />
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={15} color={colors.textMuted} />
          <Text style={styles.meta}>{formatDateRange(trip.start_date, trip.end_date)}</Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="people-outline" size={15} color={colors.textMuted} />
          <Text style={styles.meta}>
            {memberLabel}
            {roleLabel ? ` · ${roleLabel}` : ''}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  cardPressed: { backgroundColor: colors.surface },
  cover: { height: 96, width: '100%' },
  coverFallback: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: spacing.md, gap: spacing.sm },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  titleText: { flex: 1, minWidth: 0, gap: spacing.xs },
  name: { ...typography.heading, color: colors.text },
  destination: { ...typography.body, color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  meta: { ...typography.caption, color: colors.textMuted },
});
