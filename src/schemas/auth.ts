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
// Changement de mot de passe depuis l'espace connecté (employé et paramètres du propriétaire) : le
// bouton de validation reste désactivé tant que ce schéma n'est pas satisfait.
export const changePasswordSchema=z.object({
  currentPassword:z.string().min(8,'Saisissez votre mot de passe actuel (8 caractères minimum)'),
  password:strongPassword,
  confirm:z.string().min(1,'Confirmez le nouveau mot de passe'),
}).superRefine((value,ctx)=>{
  if(value.password&&value.password===value.currentPassword)ctx.addIssue({code:'custom',path:['password'],message:'Le nouveau mot de passe doit être différent de l’ancien.'});
  if(value.confirm&&value.confirm!==value.password)ctx.addIssue({code:'custom',path:['confirm'],message:'Les nouveaux mots de passe sont différents.'});
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
