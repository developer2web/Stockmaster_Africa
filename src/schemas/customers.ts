import { z } from 'zod';

const optional = z.string().trim().max(200).optional();

export const customerSchema = z.object({
  name: z.string().trim().min(2, 'Nom requis').max(120),
  phone: optional,
  email: z.union([z.string().email('Email invalide'), z.literal('')]).optional(),
  address: optional,
  note: optional,
  isActive: z.boolean(),
});

export type CustomerInput = z.infer<typeof customerSchema>;
