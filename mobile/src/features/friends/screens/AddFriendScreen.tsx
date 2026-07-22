import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { FormError } from '@/shared/ui/FormError';
import { Screen } from '@/shared/ui/Screen';
import { TextField } from '@/shared/ui/TextField';
import { FriendAvatar } from '../components/FriendAvatar';
import { useFriendSearch } from '../hooks/useFriendSearch';
import type { FriendUser } from '../types';

function FriendSearchResult({ user, sending, sent, onSend }: {
  user: FriendUser;
  sending: boolean;
  sent: boolean;
  onSend: () => void;
}) {
  return (
    <View style={styles.resultCard}>
      <View style={styles.userRow}>
        <FriendAvatar
          displayName={user.display_name}
          identifyTag={user.identify_tag}
          avatarUrl={user.avatar_url}
        />
        <View style={styles.userInfo}>
          <Text style={styles.displayName} numberOfLines={1}>
            {user.display_name}
          </Text>
          <Text style={styles.identifyTag} numberOfLines={1}>
            {user.identify_tag}
          </Text>
        </View>
      </View>

      {sent ? (
        <View accessibilityRole="alert" style={styles.sentNotice}>
          <Text style={styles.sentText}>Friend request sent.</Text>
        </View>
      ) : (
        <Button title="Send friend request" onPress={onSend} loading={sending} />
      )}
    </View>
  );
}

export function AddFriendScreen() {
  const {
    query,
    setQuery,
    user,
    searchStatus,
    searchError,
    search,
    sendStatus,
    sendError,
    sendRequest,
  } = useFriendSearch();

  const isSearching = searchStatus === 'searching';
  const isSending = sendStatus === 'sending';
  const queryFieldError =
    searchError?.fieldErrors?.identify_tag ??
    searchError?.fieldErrors?.q ??
    sendError?.fieldErrors?.identify_tag ??
    sendError?.fieldErrors?.q;

  return (
    <Screen scroll edges={['left', 'right', 'bottom']}>
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={styles.title}>
          Find a friend
        </Text>
        <Text style={styles.subtitle}>Enter their exact identify tag, including the name and code.</Text>
      </View>

      <TextField
        label="Identify tag"
        accessibilityLabel="Identify tag"
        placeholder="name#CODE"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => {
          if (query.trim() && !isSearching) {
            void search();
          }
        }}
        error={queryFieldError}
      />
      <FormError error={searchError} />
      <Button title="Search" onPress={() => void search()} loading={isSearching} disabled={!query.trim()} />

      {searchStatus === 'notFound' ? (
        <View accessibilityRole="alert" style={styles.neutralState}>
          <Text style={styles.stateTitle}>No user found</Text>
          <Text style={styles.stateBody}>Check the identify tag and try again.</Text>
        </View>
      ) : null}

      {searchStatus === 'found' && user ? (
        <>
          <FriendSearchResult
            user={user}
            sending={isSending}
            sent={sendStatus === 'sent'}
            onSend={() => void sendRequest()}
          />
          <FormError error={sendError} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: spacing.sm, marginTop: spacing.md },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted },
  neutralState: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  stateTitle: { ...typography.heading, color: colors.text },
  stateBody: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  resultCard: {
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.background,
  },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  userInfo: { flex: 1, minWidth: 0, gap: spacing.xs },
  displayName: { ...typography.body, color: colors.text, fontWeight: '600' },
  identifyTag: { ...typography.caption, color: colors.textMuted },
  sentNotice: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderCurve: 'continuous',
    backgroundColor: colors.successSoft,
  },
  sentText: { ...typography.body, color: colors.success, fontWeight: '600' },
});
