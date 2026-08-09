import { z } from 'zod';

export const companySchema = z.object({ name: z.string().trim().min(2, 'Nom requis').max(100) });
export const storeSchema = z.object({ name: z.string().trim().min(2, 'Nom requis').max(100), address: z.string().trim().max(250).optional(), isActive: z.boolean() });
export const roleSchema = z.object({ name: z.string().trim().min(2, 'Nom requis').max(60), permissions: z.array(z.string()).min(1, 'Choisissez au moins une permission') });
export const employeeSchema = z.object({
  fullName: z.string().trim().min(2, 'Nom requis'),
  email: z.string().email('Email invalide'),
  roleId: z.string().uuid('Rôle requis'),
  storeIds: z.array(z.string().uuid()),
  allStores: z.boolean(),
}).refine((value) => value.allStores || value.storeIds.length > 0, {
  message: 'Choisissez au moins une boutique',
  path: ['storeIds'],
});

export type CompanyInput = z.infer<typeof companySchema>;
export type StoreInput = z.infer<typeof storeSchema>;
export type RoleInput = z.infer<typeof roleSchema>;
export type EmployeeInput = z.infer<typeof employeeSchema>;
