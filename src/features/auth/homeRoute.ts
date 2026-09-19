import type { AppRole } from '@/types/database';

/** Page d'accueil propre à chaque rôle : un employé ne doit pas atterrir sur « / » (accueil du propriétaire). */
export function homeRoute(role: AppRole | null | undefined) {
  return role === 'employee' ? '/employee' : '/';
}
