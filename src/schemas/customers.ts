import { z } from 'zod';

const optional = z.string().trim().max(200).optional();
// Audit externe (SM-14) : ce numéro sert de clé de recherche du client en
// caisse et de contact pour Orange Money — "abc" y était accepté. Même
// format que le numéro Mobile Money déjà validé ailleurs (schemas/
// subscriptions.ts) : + facultatif, 8 à 15 chiffres.
const optionalPhone = z.union([z.string().trim().regex(/^\+?[0-9]{8,15}$/, 'Numéro de téléphone invalide.'), z.literal('')]).optional();

export const customerSchema = z.object({
  name: z.string().trim().min(2, 'Nom requis').max(120),
  phone: optionalPhone,
  email: z.union([z.string().email('Email invalide'), z.literal('')]).optional(),
  address: optional,
  note: optional,
  creditLimit: z.union([z.string().trim().regex(/^\d*(?:[.,]\d+)?$/, 'Limite invalide'), z.literal('')]).optional(),
  isActive: z.boolean(),
});

export type CustomerInput = z.infer<typeof customerSchema>;
