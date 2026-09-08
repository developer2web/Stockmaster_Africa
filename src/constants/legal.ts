import { createLegalIdentity } from './publicConfig';

export const legalIdentity = createLegalIdentity({
  entityName: process.env.EXPO_PUBLIC_LEGAL_ENTITY_NAME,
  registrationNumber: process.env.EXPO_PUBLIC_LEGAL_REGISTRATION_NUMBER,
  address: process.env.EXPO_PUBLIC_LEGAL_ADDRESS,
  privacyEmail: process.env.EXPO_PUBLIC_PRIVACY_EMAIL,
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL,
});
