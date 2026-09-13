import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { emailConfiguration } from '../_shared/email-config.ts';

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
    const security = await caller.rpc('super_admin_billing_email_settings');
    if (security.error) return json(request, { error: 'Confirmez la sécurité de votre session.' }, 403);
    const access = await caller.rpc('is_super_admin');
    if (access.error || access.data !== true) return json(request, { error: 'Accès Super Admin requis.' }, 403);
    const { apiKey, from } = emailConfiguration((name) => Deno.env.get(name));
    const groups = {
      stripe: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_SUCCESS_URL', 'STRIPE_CANCEL_URL'],
      paymentProvider: ['PAYMENT_PROVIDER_URL', 'PAYMENT_PROVIDER_API_KEY', 'PAYMENT_WEBHOOK_URL', 'PAYMENT_WEBHOOK_SECRET'],
    };
    const integrations = Object.fromEntries(Object.entries(groups).map(([name, keys]) => [name, {
      configured: keys.every(key => !!Deno.env.get(key)?.trim()),
      missing: keys.filter(key => !Deno.env.get(key)?.trim()),
    }]));
    return json(request, { integrations, email: {
      apiKeyConfigured: !!apiKey,
      senderConfigured: !!from,
      senderValid: /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from) || /^[^<>\r\n]+<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>$/.test(from),
    } });
  } catch { return json(request, { error: 'Vérification de configuration indisponible.' }, 500); }
});
