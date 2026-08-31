const fs = require('node:fs');
const { createClient } = require('@supabase/supabase-js');

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1)];
  }),
);

async function main() {
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const mobile = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, options);
  const account = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, options);
  const login = await mobile.auth.signInWithPassword({
    email: 'stockmaster.africa+rls-admin-20260831-3aab0d@gmail.com',
    password: 'Sm!RlsAdmin-2026#A9',
  });
  if (login.error) throw login.error;
  const businesses = await mobile.rpc('get_accessible_businesses');
  if (businesses.error) throw businesses.error;
  const company = businesses.data.find(item => item.role === 'company_admin');
  if (!company) throw new Error('Aucune entreprise administrateur disponible');
  const handoff = await mobile.functions.invoke('account-portal-link', {
    body: { companyId: company.company_id, portalUrl: 'http://localhost:4001' },
  });
  if (handoff.error) {
    const payload = await handoff.error.context?.clone().json().catch(() => null);
    throw new Error(payload?.error || handoff.error.message);
  }
  const portal = new URL(handoff.data.url);
  const tokenHash = portal.searchParams.get('handoff');
  if (!tokenHash || portal.searchParams.get('companyId') !== company.company_id) throw new Error('Lien Account incomplet');
  const verified = await account.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (verified.error || verified.data.user?.id !== login.data.user.id) throw verified.error ?? new Error('Identité Account différente');
  const reused = await createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, options)
    .auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (!reused.error) throw new Error('Le lien Account a pu être utilisé deux fois');
  const mobileStillConnected = await mobile.auth.getUser();
  if (mobileStillConnected.error || mobileStillConnected.data.user?.id !== login.data.user.id) throw new Error('La session mobile a été déconnectée');
  const accountBusinesses = await account.rpc('get_accessible_businesses');
  if (accountBusinesses.error || !accountBusinesses.data.some(item => item.company_id === company.company_id && item.role === 'company_admin')) {
    throw accountBusinesses.error ?? new Error('Entreprise absente du portail Account');
  }
  console.log(JSON.stringify({
    handoff: 'PASS',
    identityPreserved: true,
    companyPreserved: true,
    mobileSessionPreserved: true,
    oneTimeLink: true,
    destination: `${portal.origin}${portal.pathname}`,
    portal: portal.searchParams.get('portal'),
  }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
