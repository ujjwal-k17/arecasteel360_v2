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
  deviceApproved: boolean | null; // null = still checking
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
  deviceApproved: null,
  signOut: async () => {},
  canView: () => false,
  canEdit: () => false,
});

export const useAuth = () => useContext(AuthContext);

function getDeviceFingerprint(): string {
  const parts = [
    navigator.userAgent,
    `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
  ];
  let hash = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [deviceApproved, setDeviceApproved] = useState<boolean | null>(null);

  const fetchUserData = async (userId: string) => {
    // Fetch role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    const admin = roles?.some((r: any) => r.role === 'admin') ?? false;
    setIsAdmin(admin);

    // Admins bypass device check
    if (admin) {
      setDeviceApproved(true);
    } else {
      // Check device approval
      const fingerprint = getDeviceFingerprint();
      const { data: device } = await supabase
        .from('user_devices')
        .select('is_approved')
        .eq('user_id', userId)
        .eq('device_fingerprint', fingerprint)
        .maybeSingle();

      // If no device record yet, it will be created by useDeviceTracking as pending
      setDeviceApproved(device?.is_approved === true);
    }

    // Fetch permissions
    const { data: perms } = await supabase
      .from('user_permissions')
      .select('page, can_view, can_edit')
      .eq('user_id', userId);

    setPermissions((perms as UserPermission[]) || []);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          setTimeout(() => fetchUserData(newSession.user.id), 0);
        } else {
          setIsAdmin(false);
          setPermissions([]);
          setDeviceApproved(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s?.user) {
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
    setDeviceApproved(null);
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
    <AuthContext.Provider value={{ user, session, isAdmin, permissions, loading, deviceApproved, signOut, canView, canEdit }}>
      {children}
    </AuthContext.Provider>
  );
}
