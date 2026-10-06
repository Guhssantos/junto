import type { Session } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { persister, queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import { clearOutbox } from '@/offline/outbox';
import { fetchMyProfile } from '@/services/profile';
import type { Profile } from '@/types/models';

interface AuthValue {
  session: Session | null;
  userId: string | null;
  profile: Profile | null;
  initializing: boolean;
}

const AuthContext = createContext<AuthValue>({ session: null, userId: null, profile: null, initializing: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setInitializing(false));

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_OUT') {
        // Privacidade: nada da conta anterior fica no aparelho.
        queryClient.clear();
        void persister.removeClient();
        clearOutbox();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;
  const profileQuery = useQuery({
    queryKey: [...qk.me, userId],
    queryFn: fetchMyProfile,
    enabled: !!userId,
  });

  const value = useMemo<AuthValue>(
    () => ({ session, userId, profile: profileQuery.data ?? null, initializing }),
    [session, userId, profileQuery.data, initializing],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Para telas dentro da área logada (o layout garante a sessão). */
export function useUserId(): string {
  const { userId } = useAuth();
  return userId ?? '';
}
