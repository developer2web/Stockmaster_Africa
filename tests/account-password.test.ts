import { beforeEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({
  getUser: vi.fn(), updateUser: vi.fn(), signInWithPassword: vi.fn(),
}));
const verifier = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signOut: vi.fn() }));
vi.mock('@/services/supabase/client', () => ({ supabase: { auth }, createPasswordVerificationClient: () => ({ auth: verifier }) }));
import { changePasswordWithVerification } from '@/features/account/api';
beforeEach(() => {
  vi.clearAllMocks();
  auth.getUser.mockResolvedValue({ data: { user: { email: 'fixture@example.invalid' } }, error: null });
  auth.updateUser.mockResolvedValue({ error: null });
  verifier.signInWithPassword.mockResolvedValue({ error: null });
  verifier.signOut.mockResolvedValue({ error: null });
});
it('verifies the old password without downgrading the primary MFA session', async () => {
  await changePasswordWithVerification('OldFixture123!', 'NewFixture123!');
  expect(auth.signInWithPassword).not.toHaveBeenCalled();
  expect(verifier.signInWithPassword).toHaveBeenCalledWith({ email: 'fixture@example.invalid', password: 'OldFixture123!' });
  expect(auth.updateUser).toHaveBeenCalledWith({ password: 'NewFixture123!', current_password: 'OldFixture123!' });
  expect(verifier.signOut).toHaveBeenCalledWith({ scope: 'local' });
});
it('rejects an incorrect password before changing the real session', async () => {
  verifier.signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials' } });
  await expect(changePasswordWithVerification('incorrect', 'NewFixture123!')).rejects.toThrow('actuel');
  expect(auth.signInWithPassword).not.toHaveBeenCalled();
  expect(auth.updateUser).not.toHaveBeenCalled();
  expect(verifier.signOut).toHaveBeenCalledTimes(1);
});
it('cleans the verifier session even when the update fails', async () => {
  auth.updateUser.mockResolvedValue({ error: { message: 'Network request failed' } });
  await expect(changePasswordWithVerification('OldFixture123!', 'NewFixture123!')).rejects.toThrow();
  expect(verifier.signOut).toHaveBeenCalledTimes(1);
});
