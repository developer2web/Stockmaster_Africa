import React, { useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { supabase } from './supabase';
import { needsMfaChallenge } from '../../src/features/auth/mfaAccess';

/** Check the session before mounting pages that fetch business data. */
export function WebSessionGate({ children }: PropsWithChildren) {
  const [state, setState] = useState<'checking' | 'ready' | 'mfa' | 'password' | 'error'>('checking');
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const check = useCallback(async () => {
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) { setState('ready'); return; }
      if (await needsMfaChallenge(supabase)) { setState('mfa'); return; }
      setState(data.session.user.app_metadata?.must_change_password === true ? 'password' : 'ready');
    } catch { setError('Impossible de vérifier la sécurité de votre session. Réessayez.'); setState('error'); }
  }, []);
  useEffect(() => {
    void check();
    const { data } = supabase.auth.onAuthStateChange(() => { setTimeout(() => void check(), 0); });
    return () => data.subscription.unsubscribe();
  }, [check]);
  async function verify(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      const factor = factors.data.totp.find(item => item.status === 'verified');
      if (!factor) throw new Error('Aucun facteur valide. Reconnectez-vous.');
      const verified = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
      if (verified.error) throw verified.error;
      setCode(''); await check();
    } catch { setError('Code invalide ou expiré. Réessayez avec le code actuel.'); }
    finally { setBusy(false); }
  }
  if (state === 'ready') return <>{children}</>;
  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: '#f5faf8', color: '#183733' }}>
    <form onSubmit={verify} style={{ width: '100%', maxWidth: 420, padding: 24, borderRadius: 16, background: 'white', display: 'grid', gap: 16 }}>
      <h1 style={{ fontSize: 24, margin: 0 }}>{state === 'mfa' ? 'Vérification en deux étapes' : state === 'password' ? 'Mot de passe temporaire' : 'Vérification de la session'}</h1>
      {state === 'checking' && <p>Vérification en cours…</p>}
      {state === 'mfa' && <><label>Code de votre application d’authentification<input aria-label="Code de vérification" autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} autoFocus style={{ display: 'block', width: '100%', marginTop: 8, padding: 12, border: '1px solid #678880', borderRadius: 8 }} /></label><button disabled={busy || code.length !== 6} type="submit">{busy ? 'Vérification…' : 'Vérifier'}</button></>}
      {state === 'password' && <p>Ouvrez StockMaster pour remplacer votre mot de passe temporaire avant d’accéder à vos données.</p>}
      {!!error && <p role="alert">{error}</p>}
      {state === 'error' && <button type="button" onClick={() => void check()}>Réessayer</button>}
      <button type="button" onClick={() => void supabase.auth.signOut()}>Se déconnecter</button>
    </form>
  </main>;
}
