import { z } from 'zod';

export const loginSchema = z.object({ email: z.string().email('Adresse email invalide'), password: z.string().min(8, '8 caractères minimum') });
const strongPassword=z.string().min(10,'10 caractères minimum').regex(/[A-Z]/,'Ajoutez une majuscule').regex(/[a-z]/,'Ajoutez une minuscule').regex(/[0-9]/,'Ajoutez un chiffre').regex(/[^A-Za-z0-9]/,'Ajoutez un caractère spécial');
export const registerSchema = z.object({
  fullName: z.string().min(2, 'Nom requis'),
  email: z.string().email('Adresse email invalide'),
  password: strongPassword,
  confirmPassword: z.string(),
}).refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Les mots de passe diffèrent' });
export const resetPasswordSchema=z.object({password:strongPassword});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
