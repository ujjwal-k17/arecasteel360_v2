import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/microsoft_outlook';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const OUTLOOK_KEY = Deno.env.get('MICROSOFT_OUTLOOK_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');
    if (!OUTLOOK_KEY) throw new Error('MICROSOFT_OUTLOOK_API_KEY not configured');

    // Admin check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', userData.user.id);
    const isAdmin = roles?.some((r: any) => r.role === 'admin') ?? false;
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await req.json().catch(() => ({}));
    const sender: string | undefined = body.sender;
    const top: number = Math.min(Math.max(Number(body.top) || 25, 1), 100);

    const params = new URLSearchParams();
    params.set('$top', String(top));
    params.set('$orderby', 'receivedDateTime desc');
    params.set('$select', 'id,subject,from,receivedDateTime,bodyPreview,hasAttachments,isRead');
    if (sender && sender.trim()) {
      params.set('$filter', `from/emailAddress/address eq '${sender.trim().replace(/'/g, "''")}'`);
    }

    const res = await fetch(`${GATEWAY_URL}/me/messages?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': OUTLOOK_KEY,
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Graph API ${res.status}: ${JSON.stringify(data)}`);

    return new Response(JSON.stringify({ messages: data.value || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('outlook-list-messages error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
