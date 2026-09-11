import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);
  try {
    const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const user = await caller.auth.getUser();
    if (user.error || !user.data.user) return json(request, { error: 'Connexion requise.' }, 401);
    const security = await caller.rpc('assert_session_security', { p_allow_temporary_password: false });
    if (security.error) return json(request, { error: 'Confirmez la sécurité de votre session.' }, 403);
    const access = await caller.rpc('is_super_admin');
    if (access.error || access.data !== true) return json(request, { error: 'Accès Super Admin requis.' }, 403);
    const from = Deno.env.get('NOTIFICATION_FROM_EMAIL')?.trim() ?? '';
    return json(request, { email: {
      apiKeyConfigured: !!Deno.env.get('RESEND_API_KEY')?.trim(),
      senderConfigured: !!from,
      senderValid: /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from) || /^[^<>\r\n]+<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>$/.test(from),
    } });
  } catch { return json(request, { error: 'Vérification de configuration indisponible.' }, 500); }
});
