import { clearCachedSession, supabase } from '@/services/supabase/client';
import { isJwtIssuedInFuture, retryJwtClockSkew } from '@/services/supabase/jwtRetry';
import type { AppRole } from '@/types/database';
import { portalAccessDeniedMessage } from './portalMessages';
import { portalAllowsRoles, type LoginPortal } from './portalRules';

export type { LoginPortal } from './portalRules';

type PortalLoginResult = {
  ok: boolean;
  message?: string;
};

function normalizeRoles(rows: unknown): AppRole[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => (row as { role?: AppRole }).role)
    .filter((role): role is AppRole => !!role);
}

export async function signInForPortal(
  email: string,
  password: string,
  portal: LoginPortal,
): Promise<PortalLoginResult> {
  await clearCachedSession();
  const { data, error } = await retryJwtClockSkew(() => supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  }));

  if (error || !data.user) {
    return {
      ok: false,
      message: isJwtIssuedInFuture(error)
        ? 'Le serveur finalise votre session. Attendez quelques secondes puis réessayez.'
        : /email not confirmed/i.test(error?.message??'')
        ? 'Votre adresse email n’est pas encore confirmée. Ouvrez le message reçu dans votre boîte email ou demandez un nouvel envoi depuis la page d’inscription.'
        : 'Email ou mot de passe incorrect.',
    };
  }

  const [{ data: businesses, error: businessesError }, { data: context, error: contextError }] = await Promise.all([
    retryJwtClockSkew(() => supabase.rpc('get_accessible_businesses')),
    retryJwtClockSkew(() => supabase.rpc('get_my_context')),
  ]);

  if (businessesError || contextError) {
    await supabase.auth.signOut({ scope: 'local' });
    return { ok: false, message: 'Impossible de vérifier le type de ce compte. Réessayez.' };
  }

  const roles = normalizeRoles(businesses);
  const contextRow = Array.isArray(context) ? context[0] : context;
  const contextRole = (contextRow as { role?: AppRole } | null)?.role;
  if (contextRole && !roles.includes(contextRole)) roles.push(contextRole);

  const pendingAdministrator =
    roles.length === 0 &&
    typeof data.user.user_metadata?.company_name === 'string' &&
    data.user.user_metadata.company_name.trim().length > 0;
  const allowed = portalAllowsRoles(roles, portal, pendingAdministrator);

  if (!allowed) {
    await supabase.auth.signOut({ scope: 'local' });
    return {
      ok: false,
      message: portalAccessDeniedMessage(portal),
    };
  }

  return { ok: true };
}
