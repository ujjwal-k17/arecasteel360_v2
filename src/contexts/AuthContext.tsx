import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface UserPermission {
  page: string;
  can_view: boolean;
  can_edit: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  permissions: UserPermission[];
  loading: boolean;
  signOut: () => Promise<void>;
  canView: (page: string) => boolean;
  canEdit: (page: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isAdmin: false,
  permissions: [],
  loading: true,
  signOut: async () => {},
  canView: () => false,
  canEdit: () => false,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (userId: string) => {
    // Fetch role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    const admin = roles?.some((r: any) => r.role === 'admin') ?? false;
    setIsAdmin(admin);

    // Fetch permissions
    const { data: perms } = await supabase
      .from('user_permissions')
      .select('page, can_view, can_edit')
      .eq('user_id', userId);

    setPermissions((perms as UserPermission[]) || []);
  };


  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          // Use setTimeout to avoid deadlocks with Supabase client
          setTimeout(() => fetchUserData(newSession.user.id), 0);
        } else {
          setIsAdmin(false);
          setPermissions([]);
        }
        setLoading(false);
      }
    );

    // Then get initial session and check IP
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (s?.user) {
        const ipAllowed = await checkIpAllowed();
        if (!ipAllowed) {
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
        setSession(s);
        setUser(s.user);
        fetchUserData(s.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setIsAdmin(false);
    setPermissions([]);
  };

  const canView = (page: string) => {
    if (isAdmin) return true;
    return permissions.some(p => p.page === page && p.can_view);
  };

  const canEdit = (page: string) => {
    if (isAdmin) return true;
    return permissions.some(p => p.page === page && p.can_edit);
  };

  return (
    <AuthContext.Provider value={{ user, session, isAdmin, permissions, loading, signOut, canView, canEdit }}>
      {children}
    </AuthContext.Provider>
  );
}
