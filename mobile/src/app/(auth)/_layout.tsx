import { Redirect, Stack } from 'expo-router';
import { useSession } from '@/features/auth/session';
import { LoadingScreen } from '@/shared/ui/LoadingScreen';

export default function AuthLayout() {
  const { status, user } = useSession();
  if (status === 'restoring') {
    return <LoadingScreen />;
  }
  if (status === 'signedIn' && user && !user.requires_profile_setup) {
    return <Redirect href="/(tabs)" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
