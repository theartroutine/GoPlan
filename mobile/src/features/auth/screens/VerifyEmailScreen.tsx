import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { type ApiError, normalizeApiError } from '@/shared/api/errors';
import { colors, spacing, typography } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { FormError } from '@/shared/ui/FormError';
import { Screen } from '@/shared/ui/Screen';
import { resendVerificationRequest } from '../api';

export function VerifyEmailScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [error, setError] = useState<ApiError | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onResend() {
    if (!email) return;
    setError(null);
    setInfo(null);
    setSending(true);
    try {
      const { detail } = await resendVerificationRequest(email);
      setInfo(detail);
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen scroll>
      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.body}>
        We sent a verification link{email ? ` to ${email}` : ''}. Open it to verify your account, then come back and
        sign in.
      </Text>
      {info ? <Text style={styles.info}>{info}</Text> : null}
      <FormError error={error} />
      {email ? <Button title="Resend email" variant="secondary" onPress={onResend} loading={sending} /> : null}
      <Button title="Back to sign in" onPress={() => router.replace('/(auth)/login')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.text, marginTop: spacing.xl },
  body: { ...typography.body, color: colors.textMuted },
  info: { ...typography.body, color: colors.success },
});
