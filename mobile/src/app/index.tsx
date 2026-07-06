import { Redirect } from 'expo-router';
import { useSession } from '@/features/auth/session';
import { LoadingScreen } from '@/shared/ui/LoadingScreen';

export default function Index() {
  const { status, user } = useSession();
  if (status === 'restoring') {
    return <LoadingScreen />;
  }
  if (status === 'signedIn' && user?.requires_profile_setup) {
    return <Redirect href="/(auth)/profile-setup" />;
  }
  if (status === 'signedIn') {
    return <Redirect href="/(tabs)" />;
  }
  return <Redirect href="/(auth)/login" />;
}
