import { describe, expect, it, vi, beforeEach } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/services/supabase/client', () => ({ supabase: { rpc } }));
import { getBusinessReport } from '@/features/reports/api';

// get_business_report_with_financials ne renvoie une quantité (et get_business_report
// un chiffre d'affaires) que pour les classements qui en ont un — les produits, mais pas
// les moyens de paiement, boutiques ou employés (voir la fonction SQL : payments/
// stores_performance/employees_performance ne sélectionnent jamais "quantity", et payments
// ne sélectionne pas "revenue"). Avant ce test, la normalisation mettait ces champs
// absents à 0 au lieu de les laisser indéfinis, ce qui faisait afficher "0 unité · CA 0"
// sous chaque boutique/employé/moyen de paiement à l'écran, malgré de vraies ventes.
describe('normalisation des classements du rapport (get_business_report)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ne fabrique pas de quantité ou de CA pour les classements qui n’en renvoient pas', async () => {
    rpc.mockResolvedValue({
      error: null,
      data: {
        revenue: 50000, costOfGoods: 30000, grossProfit: 20000, expenses: 5000, netProfit: 15000,
        quantitySold: 12, saleCount: 4, stockValue: 100000,
        previous: { revenue: 0, grossProfit: 0, expenses: 0, netProfit: 0 },
        topProducts: [{ id: 'p1', name: 'Nido', quantity: 12, revenue: 50000, gross_profit: 20000 }],
        paymentMethods: [{ name: 'cash', amount: 50000, count: 4 }],
        stores: [{ id: 's1', name: 'Boutique A', revenue: 50000, gross_profit: 20000, sales: 4 }],
        employees: [{ id: 'e1', name: 'Awa', revenue: 50000, gross_profit: 20000, sales: 4 }],
      },
    });
    const report = await getBusinessReport({ startDate: '2026-09-01', endDate: '2026-09-16', storeId: 'store', employeeId: null, productId: null });

    expect(report.topProducts[0].quantity).toBe(12);
    expect(report.topProducts[0].revenue).toBe(50000);

    // Un vrai moyen de paiement, une vraie boutique et un vrai employé avec des ventes
    // réelles (amount/revenue > 0) ne doivent jamais afficher "0 unité" : le champ doit
    // rester absent, pas tomber à 0.
    expect(report.paymentMethods[0].quantity).toBeUndefined();
    expect(report.paymentMethods[0].revenue).toBeUndefined();
    expect(report.paymentMethods[0].amount).toBe(50000);

    expect(report.stores[0].quantity).toBeUndefined();
    expect(report.stores[0].revenue).toBe(50000);

    expect(report.employees[0].quantity).toBeUndefined();
    expect(report.employees[0].revenue).toBe(50000);
  });

  it('garde un vrai zéro pour un champ que le serveur renvoie bien, à zéro', async () => {
    rpc.mockResolvedValue({
      error: null,
      data: {
        revenue: 0, costOfGoods: 0, grossProfit: 0, expenses: 0, netProfit: 0,
        quantitySold: 0, saleCount: 0, stockValue: 0,
        previous: { revenue: 0, grossProfit: 0, expenses: 0, netProfit: 0 },
        topProducts: [{ id: 'p1', name: 'Produit retourné', quantity: 0, revenue: 0, gross_profit: 0 }],
        paymentMethods: [], stores: [], employees: [],
      },
    });
    const report = await getBusinessReport({ startDate: '2026-09-01', endDate: '2026-09-16', storeId: 'store', employeeId: null, productId: null });
    expect(report.topProducts[0].quantity).toBe(0);
  });
});
