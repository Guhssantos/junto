import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/** true = online, false = offline, null = ainda verificando. */
export function useIsOnline(): boolean | null {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    return NetInfo.addEventListener((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false));
  }, []);
  return online;
}
