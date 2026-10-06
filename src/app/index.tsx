import { Redirect } from 'expo-router';

import { useAuth } from '@/providers/AuthProvider';

export default function Index() {
  const { session } = useAuth();
  return <Redirect href={session ? '/home' : '/sign-in'} />;
}
