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
  // Use stable parts only – strip browser version from UA to survive auto-updates
  const ua = navigator.userAgent;
  const stableUA = ua.replace(/Chrome\/[\d.]+/g, 'Chrome').replace(/Edg\/[\d.]+/g, 'Edg').replace(/Firefox\/[\d.]+/g, 'Firefox').replace(/Safari\/[\d.]+/g, 'Safari').replace(/Version\/[\d.]+/g, 'Version');
  const parts = [
    stableUA,
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
      // Register device if not already registered, then check approval
      const fingerprint = getDeviceFingerprint();
      const { data: device } = await supabase
        .from('user_devices')
        .select('id, is_approved')
        .eq('user_id', userId)
        .eq('device_fingerprint', fingerprint)
        .maybeSingle();

      if (!device) {
        // Auto-register the device as pending so admin can see it
        const ua = navigator.userAgent;
        let browser = 'Unknown';
        let os = 'Unknown';
        if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
        else if (ua.includes('Edg')) browser = 'Edge';
        else if (ua.includes('Firefox')) browser = 'Firefox';
        else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
        if (ua.includes('Windows')) os = 'Windows';
        else if (ua.includes('Mac OS')) os = 'macOS';
        else if (ua.includes('Linux')) os = 'Linux';
        else if (ua.includes('Android')) os = 'Android';
        else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

        await supabase.from('user_devices').insert({
          user_id: userId,
          device_fingerprint: fingerprint,
          device_name: `${browser} on ${os}`,
          browser,
          os,
          is_approved: false,
        });
        setDeviceApproved(false);
      } else {
        // Update last_seen
        await supabase.from('user_devices')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', device.id);
        setDeviceApproved(device.is_approved === true);
      }
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
