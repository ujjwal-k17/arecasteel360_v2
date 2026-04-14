import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

function getDeviceFingerprint(): string {
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

function parseUserAgent() {
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

  const deviceName = `${browser} on ${os}`;
  return { browser, os, deviceName };
}

export function useDeviceTracking() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const registerDevice = async () => {
      const fingerprint = getDeviceFingerprint();
      const { browser, os, deviceName } = parseUserAgent();

      // Upsert device - update last_seen if exists, insert if new
      const { data: existing } = await supabase
        .from('user_devices')
        .select('id')
        .eq('user_id', user.id)
        .eq('device_fingerprint', fingerprint)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('user_devices')
          .update({ last_seen_at: new Date().toISOString(), device_name: deviceName, browser, os })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('user_devices')
          .insert({
            user_id: user.id,
            device_fingerprint: fingerprint,
            device_name: deviceName,
            browser,
            os,
            is_approved: false,
          });
      }
    };

    registerDevice();
  }, [user?.id]);
}
