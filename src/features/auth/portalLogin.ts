import { needsMfaChallenge } from './mfaAccess';
import { clearCachedSession, supabase } from '@/services/supabase/client';
import { isJwtIssuedInFuture, retryJwtClockSkew } from '@/services/supabase/jwtRetry';
import type { AppRole } from '@/types/database';
import { portalAccessDeniedMessage } from './portalMessages';
import { portalAllowsRoles, type LoginPortal } from './portalRules';
import { usePortalLoginState } from './portalLoginState';
import { withRequestTimeout } from '@/services/supabase/requestTimeout';

export type { LoginPortal } from './portalRules';

type PortalLoginResult = {
  ok: boolean;
  message?: string;
  mfaRequired?: boolean;
};

function normalizeRoles(rows: unknown): AppRole[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => (row as { role?: AppRole }).role)
    .filter((role): role is AppRole => !!role);
}

async function performPortalSignIn(
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

  if (await needsMfaChallenge(supabase)) return { ok: true, mfaRequired: true };
  if (data.user.app_metadata?.must_change_password === true) return { ok: true };
  return validateCurrentPortal(portal, data.user);
}

export async function validateCurrentPortal(portal: LoginPortal, knownUser?: { user_metadata?: Record<string, unknown> }): Promise<PortalLoginResult> {
  const user = knownUser ?? (await supabase.auth.getUser()).data.user;
  if (!user) return { ok: false, message: 'Reconnectez-vous.' };
  const [{ data: businesses, error: businessesError }, { data: context, error: contextError }] = await Promise.all([
    withRequestTimeout(signal => retryJwtClockSkew(() => supabase.rpc('get_accessible_businesses').abortSignal(signal))),
    withRequestTimeout(signal => retryJwtClockSkew(() => supabase.rpc('get_my_context').abortSignal(signal))),
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
    typeof user.user_metadata?.company_name === 'string' &&
    user.user_metadata.company_name.trim().length > 0;
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

export async function signInForPortal(email: string, password: string, portal: LoginPortal): Promise<PortalLoginResult> {
  const state = usePortalLoginState.getState();
  if (state.pending) return { ok: false, message: 'Une connexion est déjà en cours.' };
  state.setPending(true);
  state.setRequestedPortal(portal);
  try { return await performPortalSignIn(email, password, portal); }
  catch { await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined); return { ok: false, message: 'Impossible de vérifier votre connexion. Réessayez.' }; }
  finally { state.setPending(false); }
}
