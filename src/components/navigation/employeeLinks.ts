import { useWindowDimensions } from 'react-native';
import { hasAnyPermission } from '@/features/auth/permissions';
import type { MembershipContext } from '@/types/database';

// Même seuil que la navigation latérale de l'administrateur (AdminNavigation) : au-delà,
// l'espace employé reprend le même design (menu à gauche) ; en dessous — téléphone,
// petite tablette — la barre d'icônes du bas reste le seul chemin de navigation.
export const EMPLOYEE_DESKTOP_MIN_WIDTH = 960;

export function useEmployeeDesktopLayout() {
  return useWindowDimensions().width >= EMPLOYEE_DESKTOP_MIN_WIDTH;
}

export type EmployeeLink = { label: string; description: string; icon: string; path: string };
type Rule = EmployeeLink & { permissions?: string[] };

const strip = ({ label, description, icon, path }: Rule): EmployeeLink => ({ label, description, icon, path });

// Accès rapides principaux (menu latéral) : mêmes permissions que la barre du bas.
export function employeePrimaryLinks(membership: MembershipContext | null): EmployeeLink[] {
  const rules: Rule[] = [
    { label: 'Accueil', description: 'Résumé de votre journée', icon: 'home-outline', path: '/employee' },
    { label: 'Vente', description: 'Scanner, ajouter les articles et encaisser', icon: 'cart-plus', path: '/employee/sales/new', permissions: ['sales.write'] },
    { label: 'Ventes', description: 'Historique des ventes', icon: 'receipt-text-outline', path: '/employee/sales', permissions: ['sales.read', 'sales.write'] },
    { label: 'Produits', description: 'Consulter les produits', icon: 'package-variant-closed', path: '/employee/products', permissions: ['products.read', 'products.write'] },
    { label: 'Caisse', description: 'Solde, entrées et sorties', icon: 'wallet-outline', path: '/employee/cash', permissions: ['cash.open', 'cash.reopen', 'cash_transactions.read', 'cash_transactions.write', 'expenses.read'] },
  ];
  return rules.filter(rule => !rule.permissions || hasAnyPermission(membership, rule.permissions)).map(strip);
}

// Outils filtrés par permission : liste unique, partagée par l'écran « Plus » (téléphone) et
// le menu latéral (ordinateur) pour qu'elles ne divergent jamais.
export function employeeToolLinks(membership: MembershipContext | null): EmployeeLink[] {
  const rules: Rule[] = [
    // Pas d'entrée « Notifications » : la cloche de l'en-tête y mène déjà (demande du 26/09).
    { label: 'Fournisseurs', description: 'Consulter les partenaires', icon: 'truck-outline', path: '/employee/suppliers', permissions: ['suppliers.read', 'suppliers.write'] },
    { label: 'Catalogue', description: 'Produits et fournisseurs autorisés', icon: 'book-open-page-variant-outline', path: '/employee/catalog', permissions: ['products.read', 'suppliers.read'] },
    { label: 'Comptabilité', description: 'Achats, dépenses et paiements', icon: 'calculator-variant-outline', path: '/employee/accounting', permissions: ['purchases.read', 'payments.read', 'expenses.read'] },
    { label: 'Dépenses', description: 'Consulter ou enregistrer les charges', icon: 'cash-minus', path: '/employee/expenses', permissions: ['expenses.read', 'expenses.write'] },
    { label: 'Rapports', description: 'Ventes et performances', icon: 'chart-box-outline', path: '/employee/reports', permissions: ['daily_reports.read', 'monthly_reports.read'] },
    { label: 'Scanner', description: 'Lire un code-barres ou QR code', icon: 'barcode-scan', path: '/employee/scanner', permissions: ['products.read', 'sales.write'] },
  ];
  return rules
    .filter(rule => !rule.permissions || hasAnyPermission(membership, rule.permissions))
    .map(strip);
}

// Lien actif = correspondance la plus spécifique : sur /employee/sales/new, « Vente »
// (/employee/sales/new) doit gagner sur « Ventes » (/employee/sales), qui en est aussi un préfixe.
export function activeEmployeePath(pathname: string, paths: string[]) {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const matches = paths.filter(path => (path === '/employee' ? clean === '/employee' : clean === path || clean.startsWith(`${path}/`)));
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}
