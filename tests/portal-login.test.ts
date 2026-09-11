import { beforeEach, describe, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({
  clearCachedSession: vi.fn(), rpc: vi.fn(),
  auth: { signInWithPassword: vi.fn(), signOut: vi.fn(), mfa: { getAuthenticatorAssuranceLevel: vi.fn() } },
}));
vi.mock('@/services/supabase/client', () => ({ supabase: { ...backend, rpc: (name: string) => ({ abortSignal: () => backend.rpc(name) }) }, clearCachedSession: backend.clearCachedSession }));
import { signInForPortal } from '@/features/auth/portalLogin';
import { usePortalLoginState } from '@/features/auth/portalLoginState';

beforeEach(() => {
  vi.clearAllMocks();
  backend.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
  usePortalLoginState.getState().setPending(false);
  backend.auth.signInWithPassword.mockResolvedValue({ data: { user: { user_metadata: {} } }, error: null });
  backend.auth.signOut.mockResolvedValue({ error: null });
});

describe('portal login validation', () => {
  it.each([['company_admin', 'admin'], ['employee', 'employee']] as const)('accepts %s through its assigned portal', async (role, portal) => {
    backend.rpc.mockResolvedValue({ data: [{ role }], error: null });
    expect(await signInForPortal(' Test@example.invalid ', 'fixture', portal)).toEqual({ ok: true });
    expect(backend.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'test@example.invalid', password: 'fixture' });
    expect(backend.auth.signOut).not.toHaveBeenCalled();
    expect(usePortalLoginState.getState().pending).toBe(false);
  });

  it('accepts a multi-role account in each assigned portal', async () => {
    backend.rpc.mockImplementation((name) => Promise.resolve({
      data: name === 'get_accessible_businesses'
        ? [{ company_id: 'owned', role: 'company_admin' }, { company_id: 'assigned', role: 'employee' }]
        : [{ role: 'employee' }],
      error: null,
    }));
    expect(await signInForPortal('test@example.invalid', 'fixture', 'admin')).toEqual({ ok: true });
    expect(await signInForPortal('test@example.invalid', 'fixture', 'employee')).toEqual({ ok: true });
    expect(backend.auth.signOut).not.toHaveBeenCalled();
  });

  it('keeps new owner onboarding accessible through the administrator login', async () => {
    backend.auth.signInWithPassword.mockResolvedValue({ data: { user: { user_metadata: { company_name: 'Nouvelle boutique' } } }, error: null });
    backend.rpc.mockResolvedValue({ data: [], error: null });
    expect(await signInForPortal('test@example.invalid', 'fixture', 'admin')).toEqual({ ok: true });
  });

  it('rejects Super Administration even when another app role is assigned', async () => {
    backend.rpc.mockImplementation((name) => Promise.resolve({
      data: name === 'get_my_context' ? [{ role: 'super_admin' }] : [{ role: 'company_admin' }],
      error: null,
    }));
    const result = await signInForPortal('test@example.invalid', 'fixture', 'admin');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('ne possède pas d’accès administrateur');
    expect(backend.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('shows a refusal instead of accepting an account without an assigned workspace', async () => {
    backend.rpc.mockResolvedValue({ data: [], error: null });
    const result = await signInForPortal('test@example.invalid', 'fixture', 'admin');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('ne possède pas d’accès administrateur');
    expect(backend.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('keeps the login pending during role checks and rejects concurrent submissions', async () => {
    let finishCheck!: (value: { data: { role: string }[]; error: null }) => void;
    const roleCheck = new Promise<{ data: { role: string }[]; error: null }>((resolve) => { finishCheck = resolve; });
    backend.rpc.mockReturnValue(roleCheck);
    const firstLogin = signInForPortal('test@example.invalid', 'fixture', 'employee');
    expect(usePortalLoginState.getState().pending).toBe(true);
    expect(await signInForPortal('other@example.invalid', 'fixture', 'employee')).toEqual({ ok: false, message: 'Une connexion est déjà en cours.' });
    finishCheck({ data: [{ role: 'employee' }], error: null });
    expect(await firstLogin).toEqual({ ok: true });
    expect(backend.auth.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(usePortalLoginState.getState().pending).toBe(false);
  });

  it('distinguishes a server verification failure from missing authorization', async () => {
    backend.rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    expect(await signInForPortal('test@example.invalid', 'fixture', 'admin')).toEqual({ ok: false, message: 'Impossible de vérifier le type de ce compte. Réessayez.' });
    expect(backend.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(usePortalLoginState.getState().pending).toBe(false);
  });

  it('rejects an employee from the owner portal and releases the login state', async () => {
    backend.rpc.mockResolvedValue({ data: [{ role: 'employee' }], error: null });
    const result = await signInForPortal('test@example.invalid', 'fixture', 'admin');
    expect(result).toEqual({ ok: false, message: 'Ce compte ne possède pas d’accès administrateur.' });
    expect(backend.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(usePortalLoginState.getState().pending).toBe(false);
  });
  it('rejects an owner from the employee portal', async () => {
    backend.rpc.mockResolvedValue({ data: [{ role: 'company_admin' }], error: null });
    expect(await signInForPortal('test@example.invalid', 'fixture', 'employee')).toEqual({ ok: false, message: 'Ce compte ne possède pas d’accès employé.' });
  });
  it('keeps an authorized owner session and cleans up on unexpected failure', async () => {
    backend.rpc.mockResolvedValue({ data: [{ role: 'company_admin' }], error: null });
    expect(await signInForPortal('test@example.invalid', 'fixture', 'admin')).toEqual({ ok: true });
    expect(backend.auth.signOut).not.toHaveBeenCalled();
    backend.rpc.mockRejectedValue(new Error('Network failure'));
    expect((await signInForPortal('test@example.invalid', 'fixture', 'admin')).ok).toBe(false);
    expect(backend.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(usePortalLoginState.getState().pending).toBe(false);
  });
});

it('requires an enrolled second factor before any workspace query', async () => {
  backend.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
  expect(await signInForPortal('test@example.invalid', 'fixture', 'admin')).toEqual({ ok: true, mfaRequired: true });
  expect(backend.rpc).not.toHaveBeenCalled();
  expect(backend.auth.signOut).not.toHaveBeenCalled();
});
it('does not bypass a failed MFA assurance check', async () => {
  backend.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null, error: new Error('unavailable') });
  expect((await signInForPortal('test@example.invalid', 'fixture', 'admin')).ok).toBe(false);
  expect(backend.rpc).not.toHaveBeenCalled();
});
it('allows the password replacement screen but loads no business with a temporary password', async () => {
  backend.auth.signInWithPassword.mockResolvedValue({ data: { user: { app_metadata: { must_change_password: true }, user_metadata: { must_change_password: false } } }, error: null });
  expect(await signInForPortal('test@example.invalid', 'fixture', 'employee')).toEqual({ ok: true });
  expect(backend.rpc).not.toHaveBeenCalled();
});
