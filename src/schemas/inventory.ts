import { z } from 'zod';
import { wholeNumberError } from '@/utils/number';

export const stockMovementSchema = z.object({
  storeId: z.string().uuid('Boutique requise'),
  variantId: z.string().uuid().nullable(),
  direction: z.enum(['in','out']),
  quantity: z.string().superRefine((value, ctx) => {
    const error = wholeNumberError(value);
    if (error) ctx.addIssue({ code: 'custom', message: error === 'Valeur requise' ? 'Quantité requise' : error });
    else if (Number(value.replace(/\s/g, '')) <= 0) ctx.addIssue({ code: 'custom', message: 'La quantité doit être supérieure à zéro.' });
  }),
  note: z.string().trim().min(3, 'Le motif de la correction est obligatoire').max(250, '250 caractères maximum'),
});
export type StockMovementInput = z.infer<typeof stockMovementSchema>;
