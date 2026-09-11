import { createClient } from 'npm:@supabase/supabase-js@2';
import { accountHandoffUrl, accountPortalDestination } from '../_shared/portal.ts';

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
    const { error: securityError } = await caller.rpc('assert_session_security', { p_allow_temporary_password: false });
    if (securityError) throw securityError;

    const body = await request.json().catch(() => ({})) as { companyId?: string; portalUrl?: string };
    if (!body.companyId) throw new Error('Entreprise requise');
    const portal = accountPortalDestination(Deno.env.get('ACCOUNT_WEB_URL'), body.portalUrl, Deno.env.get('ACCOUNT_PORTAL_ALLOW_LOCAL_HTTP') === 'true');
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

    const url = accountHandoffUrl(portal, body.companyId, generated.data.properties.hashed_token);
    return Response.json({ url }, { headers: { ...cors, 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Impossible d’ouvrir le portail Account.';
    return Response.json({ error: message }, { status: /Session|Seul/.test(message) ? 403 : 400, headers: cors });
  }
});
