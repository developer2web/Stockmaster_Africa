import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-bootstrap-secret, content-type',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors });

  try {
    const expectedSecret = Deno.env.get('SUPER_ADMIN_BOOTSTRAP_SECRET');
    const suppliedSecret = request.headers.get('x-bootstrap-secret');
    if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors });
    }

    const body = await request.json() as { email?: string; password?: string; fullName?: string };
    const email = body.email?.trim().toLowerCase() ?? '';
    const password = body.password ?? '';
    const fullName = body.fullName?.trim() || 'Super Administrateur';
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Adresse email invalide');
    if (password.length < 14) throw new Error('Le mot de passe doit contenir au moins 14 caractères');

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { count, error: countError } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_super_admin', true);
    if (countError) throw countError;
    if ((count ?? 0) >= 3) {
      return Response.json({ error: 'La limite de 3 Super Administrateurs est atteinte.' }, { status: 409, headers: cors });
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
      app_metadata: { role: 'super_admin' },
    });
    if (error) throw error;
    const { error: profileError } = await admin.from('profiles').upsert({
      id: data.user.id,
      full_name: fullName,
      is_super_admin: true,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id);
      throw profileError;
    }
    return Response.json({ id: data.user.id, email }, { status: 201, headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Erreur inconnue' }, { status: 400, headers: cors });
  }
});
