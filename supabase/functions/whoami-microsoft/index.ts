import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2.95.0/cors';

const OUTLOOK_GATEWAY = 'https://connector-gateway.lovable.dev/microsoft_outlook';
const ONEDRIVE_GATEWAY = 'https://connector-gateway.lovable.dev/microsoft_onedrive';

async function fetchMe(gatewayUrl: string, connectionKey: string | undefined, lovableKey: string) {
  if (!connectionKey) {
    return { status: 'not_linked', error: 'Connection not linked' };
  }
  try {
    const res = await fetch(`${gatewayUrl}/me`, {
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'X-Connection-Api-Key': connectionKey,
      },
    });
    const data = await res.json();
    if (!res.ok) {
      return { status: 'error', error: `[${res.status}] ${JSON.stringify(data)}` };
    }
    return {
      status: 'connected',
      displayName: data.displayName ?? null,
      mail: data.mail ?? null,
      userPrincipalName: data.userPrincipalName ?? null,
      id: data.id ?? null,
    };
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin check
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', claims.claims.sub)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden — admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableKey) throw new Error('LOVABLE_API_KEY missing');

    const outlookKey = Deno.env.get('MICROSOFT_OUTLOOK_API_KEY');
    const onedriveKey = Deno.env.get('MICROSOFT_ONEDRIVE_API_KEY');

    const [outlook, onedrive] = await Promise.all([
      fetchMe(OUTLOOK_GATEWAY, outlookKey, lovableKey),
      fetchMe(ONEDRIVE_GATEWAY, onedriveKey, lovableKey),
    ]);

    return new Response(JSON.stringify({ outlook, onedrive }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
