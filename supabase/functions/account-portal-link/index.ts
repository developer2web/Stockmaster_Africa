import { createClient } from 'npm:@supabase/supabase-js@2';

type MembershipRole = { code?: string } | { code?: string }[] | null;

function roleCode(role: MembershipRole) {
  return Array.isArray(role) ? role[0]?.code : role?.code;
}

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function corsHeaders(request: Request) {
  const origin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': origin && allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0] ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

function safePortalUrl(value: unknown) {
  const configured = Deno.env.get('ACCOUNT_WEB_URL')?.trim();
  const raw = typeof value === 'string' && value.trim() ? value.trim() : configured || 'http://localhost:4001';
  const url = new URL(raw);
  const privateDevelopmentHost = url.hostname === 'localhost'
    || url.hostname === '127.0.0.1'
    || /^10\./.test(url.hostname)
    || /^192\.168\./.test(url.hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && privateDevelopmentHost)) {
    throw new Error('Adresse du portail Account non autorisée');
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

Deno.serve(async (request) => {
  const cors = corsHeaders(request);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authorization = request.headers.get('Authorization') ?? '';
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user?.email) throw new Error('Session expirée. Reconnectez-vous dans StockMaster.');

    const body = await request.json().catch(() => ({})) as { companyId?: string; portalUrl?: string };
    if (!body.companyId) throw new Error('Entreprise requise');
    const { data: memberships, error: membershipError } = await admin
      .from('memberships')
      .select('company_id,is_active,role:roles(code)')
      .eq('company_id', body.companyId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1);
    const membership = memberships?.[0] as { role: MembershipRole } | undefined;
    if (membershipError || roleCode(membership?.role ?? null) !== 'company_admin') {
      throw new Error('Seul le propriétaire ou administrateur peut gérer le forfait.');
    }

    const generated = await admin.auth.admin.generateLink({ type: 'magiclink', email: user.email });
    if (generated.error || !generated.data.properties?.hashed_token) {
      throw generated.error ?? new Error('Connexion Account indisponible');
    }

    const portal = safePortalUrl(body.portalUrl);
    portal.searchParams.set('portal', 'subscription');
    portal.searchParams.set('companyId', body.companyId);
    portal.searchParams.set('handoff', generated.data.properties.hashed_token);
    return Response.json({ url: portal.toString() }, { headers: { ...cors, 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Impossible d’ouvrir le portail Account.';
    return Response.json({ error: message }, { status: /Session|Seul/.test(message) ? 403 : 400, headers: cors });
  }
});
