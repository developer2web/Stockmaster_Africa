type PublicEnv = Record<string, string | undefined>;

export function sharedPublicValue(env: PublicEnv, key: string) {
  const expo = env[`EXPO_PUBLIC_${key}`]?.trim();
  const vite = env[`VITE_${key}`]?.trim();
  if (expo && vite && expo !== vite) throw new Error(`Configuration discordante : EXPO_PUBLIC_${key} et VITE_${key}.`);
  return expo || vite || '';
}

export function validateSharedPublicConfig(env: PublicEnv) {
  for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'LEGAL_ENTITY_NAME', 'LEGAL_REGISTRATION_NUMBER', 'LEGAL_ADDRESS', 'PRIVACY_EMAIL', 'SUPPORT_EMAIL']) {
    sharedPublicValue(env, key);
    if (env[`VITE_${key}`]?.trim() && !env[`EXPO_PUBLIC_${key}`]?.trim()) throw new Error(`Renseignez EXPO_PUBLIC_${key} pour partager la configuration avec l’application.`);
  }
  const account = env.EXPO_PUBLIC_ACCOUNT_WEB_URL?.trim().replace(/\/$/, '');
  const webAccount = env.VITE_ACCOUNT_URL?.trim().replace(/\/$/, '');
  if (account && webAccount && account !== webAccount) throw new Error('Configuration discordante : EXPO_PUBLIC_ACCOUNT_WEB_URL et VITE_ACCOUNT_URL.');
}

export function createLegalIdentity(input: { entityName?: string; registrationNumber?: string; address?: string; privacyEmail?: string; supportEmail?: string }) {
  return {
    serviceName: 'StockMaster',
    entityName: input.entityName?.trim() || 'Identité juridique de l’éditeur à compléter avant publication',
    registrationNumber: input.registrationNumber?.trim() || 'RCCM / NIF à compléter avant publication',
    address: input.address?.trim() || 'Adresse légale à compléter avant publication',
    privacyEmail: input.privacyEmail?.trim() || 'Adresse de confidentialité à compléter avant publication',
    supportEmail: input.supportEmail?.trim() || 'Adresse d’assistance à compléter avant publication',
  };
}

export function legalIdentityFromEnv(env: PublicEnv) {
  return createLegalIdentity({ entityName: sharedPublicValue(env, 'LEGAL_ENTITY_NAME'), registrationNumber: sharedPublicValue(env, 'LEGAL_REGISTRATION_NUMBER'), address: sharedPublicValue(env, 'LEGAL_ADDRESS'), privacyEmail: sharedPublicValue(env, 'PRIVACY_EMAIL'), supportEmail: sharedPublicValue(env, 'SUPPORT_EMAIL') });
}

export function renderLegalIdentity(html: string, env: PublicEnv) {
  const identity = legalIdentityFromEnv(env);
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return html.replace(/\{\{legal\.(\w+)\}\}/g, (token, key: string) => key in identity ? escape(identity[key as keyof typeof identity]) : token);
}
