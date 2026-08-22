const configured = (value: string | undefined, fallback: string) => value?.trim() || fallback;

export const legalIdentity = {
  serviceName: 'StockMaster',
  entityName: configured(
    process.env.EXPO_PUBLIC_LEGAL_ENTITY_NAME,
    'Identité juridique de l’éditeur à compléter avant publication',
  ),
  registrationNumber: configured(
    process.env.EXPO_PUBLIC_LEGAL_REGISTRATION_NUMBER,
    'RCCM / NIF à compléter avant publication',
  ),
  address: configured(
    process.env.EXPO_PUBLIC_LEGAL_ADDRESS,
    'Adresse légale à compléter avant publication',
  ),
  privacyEmail: configured(
    process.env.EXPO_PUBLIC_PRIVACY_EMAIL,
    'Adresse de confidentialité à compléter avant publication',
  ),
  supportEmail: configured(
    process.env.EXPO_PUBLIC_SUPPORT_EMAIL,
    'Adresse d’assistance à compléter avant publication',
  ),
};

