import { createClient } from 'npm:@supabase/supabase-js@2';

type MembershipRole = { code?: string } | { code?: string }[] | null;
type MembershipRow = { company_id: string; role: MembershipRole };

function roleCode(role: MembershipRole): string | undefined {
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
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors });
  }
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token = request.headers.get('Authorization') ?? '';
    const caller = createClient(url, anon, { global: { headers: { Authorization: token } } });
    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) throw new Error('Non authentifié');

    const body = await request.json() as { email?: string; fullName?: string; roleId?: string; storeIds?: string[]; allStores?: boolean; companyId?: string };
    const email = body.email?.trim().toLowerCase() ?? '';
    const fullName = body.fullName?.trim() ?? '';
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Adresse email invalide');
    if (fullName.length < 2) throw new Error('Nom de l’employé invalide');
    if (!body.roleId) throw new Error('Rôle employé requis');
    if (!body.companyId) throw new Error('Entreprise requise');
    const { data: memberships, error: contextError } = await admin.from('memberships').select('company_id,is_active,role:roles(code)').eq('user_id',user.id).eq('company_id',body.companyId).eq('is_active',true);
    const currentMembership = memberships?.[0] as MembershipRow | undefined;
    if (contextError || roleCode(currentMembership?.role ?? null) !== 'company_admin') throw new Error('Accès administrateur requis');
    const { data: subscription } = await admin.from('subscriptions').select('status').eq('company_id',body.companyId).in('status',['trialing','active']).limit(1).maybeSingle();
    if (!subscription) throw new Error('Abonnement inactif');
    const current = { company_id: body.companyId };

    const { data: role } = await admin.from('roles').select('id,company_id,code').eq('id', body.roleId).eq('company_id', current.company_id).eq('code', 'employee').single();
    if (!role) throw new Error('Rôle employé invalide');
    const storeIds = [...new Set(body.storeIds ?? [])];
    if (!body.allStores && !storeIds.length) throw new Error('Choisissez au moins une boutique');
    if (storeIds.length) {
      const { data: stores } = await admin.from('stores').select('id').in('id', storeIds).eq('company_id', current.company_id).eq('is_active', true);
      if ((stores?.length ?? 0) !== storeIds.length) throw new Error('Boutique invalide');
    }

    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const random = crypto.getRandomValues(new Uint32Array(14));
    const temporaryPassword = `Sm!${Array.from(random, (value) => alphabet[value % alphabet.length]).join('')}`;
    const { data: directoryEntry, error: directoryError } = await admin
      .from('user_email_directory')
      .select('user_id')
      .eq('email_normalized', email)
      .maybeSingle();
    if (directoryError) throw directoryError;
    let employee: { id: string; email?: string } | undefined = directoryEntry
      ? { id: directoryEntry.user_id, email }
      : undefined;
    if (employee) {
      const { data: existingMemberships, error: membershipLookupError } = await admin
        .from('memberships').select('company_id,role:roles(code)').eq('user_id', employee.id);
      if (membershipLookupError) throw membershipLookupError;
      const typedMemberships = (existingMemberships ?? []) as MembershipRow[];
      const belongsHere = typedMemberships.some((membership) => membership.company_id === current.company_id);
      const isEmployeeHere = typedMemberships.some(
        (membership) => membership.company_id === current.company_id
          && roleCode(membership.role) === 'employee',
      );
      if (!belongsHere || !isEmployeeHere) {
        throw new Error('Cet email existe déjà sur un autre compte.');
      }
      throw new Error('Cet employé existe déjà. Réactivez son accès sans réinitialiser son mot de passe.');
    }
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName, invited_company_id: current.company_id },
    });
    if (createError) {
      if (createError.status === 422 || /already.*registered|already.*exists/i.test(createError.message)) {
        throw new Error('Cet email existe déjà sur un autre compte.');
      }
      throw createError;
    }
    employee = created.user;
    await admin.from('profiles').upsert({ id: employee.id, full_name: fullName });
    const { data: membership, error: membershipError } = await admin.from('memberships').upsert({
      company_id: current.company_id, user_id: employee.id, role_id: body.roleId,
      store_id: body.allStores ? null : storeIds[0] ?? null, all_stores: !!body.allStores, is_active: true, created_by: user.id,
    }, { onConflict: 'company_id,user_id' }).select('id').single();
    if (membershipError) throw membershipError;
    await admin.from('membership_stores').delete().eq('membership_id', membership.id);
    if (!body.allStores && storeIds.length) {
      const { error: storesError } = await admin.from('membership_stores').insert(storeIds.map((storeId) => ({
        company_id: current.company_id, membership_id: membership.id, store_id: storeId, created_by: user.id,
      })));
      if (storesError) throw storesError;
    }
    return Response.json({ userId: employee.id, temporaryPassword }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Erreur inconnue' }, { status: 400, headers: cors });
  }
});
