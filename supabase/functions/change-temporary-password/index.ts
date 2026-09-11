import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { validateReplacementPassword } from '../_shared/password.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user?.email) return json(request, { error: 'Session expirée. Reconnectez-vous.' }, 401);
    const { error: securityError } = await caller.rpc('assert_session_security', { p_allow_temporary_password: true });
    if (securityError) return json(request, { error: securityError.message }, 403);
    if (user.app_metadata?.must_change_password !== true) return json(request, { error: 'Ce compte ne possède pas de mot de passe temporaire.' }, 409);
    const body = await request.json() as { password?: unknown };
    const password = validateReplacementPassword(body.password);
    // Do not permit keeping the shared temporary credential as the new secret.
    const verifier = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const previous = await verifier.auth.signInWithPassword({ email: user.email, password });
    if (previous.data.session) {
      await verifier.auth.signOut({ scope: 'local' });
      return json(request, { error: 'Choisissez un mot de passe différent du mot de passe temporaire.' }, 400);
    }
    if (previous.error?.code !== 'invalid_credentials') {
      return json(request, { error: 'Vérification du mot de passe indisponible. Réessayez dans quelques instants.' }, 503);
    }
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    // The client cannot update app_metadata. Password and access flag change together.
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      app_metadata: { ...user.app_metadata, must_change_password: false },
      user_metadata: { ...user.user_metadata, must_change_password: false },
    });
    if (error) return json(request, { error: 'Le mot de passe n’a pas pu être modifié. Réessayez.' }, 400);
    return new Response(JSON.stringify({ changed: true }), { headers: { ...corsHeaders(request), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : 'Modification impossible.' }, 400);
  }
});
