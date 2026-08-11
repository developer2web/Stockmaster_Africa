import { z } from 'zod';

export const paymentRequestSchema = z.object({
  phoneNumber: z.string()
    .trim()
    .regex(/^\+?[0-9]{8,15}$/, 'Numéro Mobile Money invalide.'),
  provider: z.string().trim().min(2, 'Choisissez un moyen de paiement.'),
});

export type PaymentRequestInput = z.infer<typeof paymentRequestSchema>;
