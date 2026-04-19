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
    const messageId: string = body.messageId;
    if (!messageId || typeof messageId !== 'string') {
      return new Response(JSON.stringify({ error: 'messageId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const safeId = encodeURIComponent(messageId);

    const headers = {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': OUTLOOK_KEY,
    };

    const [msgRes, attRes] = await Promise.all([
      fetch(`${GATEWAY_URL}/me/messages/${safeId}?$select=id,subject,from,toRecipients,receivedDateTime,body,hasAttachments`, { headers }),
      fetch(`${GATEWAY_URL}/me/messages/${safeId}/attachments?$select=id,name,size,contentType`, { headers }),
    ]);

    const message = await msgRes.json();
    if (!msgRes.ok) throw new Error(`Graph message ${msgRes.status}: ${JSON.stringify(message)}`);
    const attachments = await attRes.json();
    if (!attRes.ok) throw new Error(`Graph attachments ${attRes.status}: ${JSON.stringify(attachments)}`);

    return new Response(JSON.stringify({ message, attachments: attachments.value || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('outlook-get-message error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
