import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { type ApiError, normalizeApiError } from '@/shared/api/errors';
import { colors, spacing, typography } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { FormError } from '@/shared/ui/FormError';
import { Screen } from '@/shared/ui/Screen';
import { TextField } from '@/shared/ui/TextField';
import { profileSetupRequest } from '../api';
import { useSession } from '../session';

export function ProfileSetupScreen() {
  const { updateUser } = useSession();
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [identifyName, setIdentifyName] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const user = await profileSetupRequest({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        identify_name: identifyName.trim(),
      });
      updateUser(user);
      router.replace('/');
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen scroll>
      <Text style={styles.title}>Set up your profile</Text>
      <Text style={styles.subtitle}>Tell your friends who you are. You can change your display name later.</Text>
      <TextField
        label="First name"
        accessibilityLabel="First name"
        value={firstName}
        onChangeText={setFirstName}
        error={error?.fieldErrors?.first_name}
      />
      <TextField
        label="Last name"
        accessibilityLabel="Last name"
        value={lastName}
        onChangeText={setLastName}
        error={error?.fieldErrors?.last_name}
      />
      <TextField
        label="Identify name"
        accessibilityLabel="Identify name"
        autoCapitalize="none"
        value={identifyName}
        onChangeText={setIdentifyName}
        error={error?.fieldErrors?.identify_name}
      />
      <FormError error={error} />
      <Button
        title="Finish setup"
        onPress={onSubmit}
        loading={submitting}
        disabled={!firstName.trim() || !lastName.trim() || !identifyName.trim()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.text, marginTop: spacing.xl },
  subtitle: { ...typography.body, color: colors.textMuted, marginBottom: spacing.md },
});
