import { expect, it } from 'vitest';
import { notificationTarget } from '@/features/notifications/access';
import type { MembershipContext } from '@/types/database';

const admin = { companyId: 'company', storeId: 'store-a', role: 'company_admin', permissions: [] } as unknown as MembershipContext;
const employee = (permissions: string[]) => ({ companyId: 'company', storeId: 'store-a', role: 'employee', permissions }) as unknown as MembershipContext;

it('sends the administrator straight to the page a notification is about', () => {
  expect(notificationTarget('employee_access_removal_request', admin)).toBe('/employees');
  expect(notificationTarget('low_stock', admin)).toBe('/stock');
  expect(notificationTarget('stock_out', admin)).toBe('/stock');
  expect(notificationTarget('negative_stock', admin)).toBe('/stock');
  expect(notificationTarget('customer_debt', admin)).toBe('/customers');
  expect(notificationTarget('supplier_debt', admin)).toBe('/suppliers');
  expect(notificationTarget('cash_unclosed', admin)).toBe('/cash');
  expect(notificationTarget('support_ticket_new', admin)).toBe('/support');
  expect(notificationTarget('support_ticket_updated', admin)).toBe('/support');
  expect(notificationTarget('subscription_payment_succeeded', admin)).toBe('/(subscription)/history');
  expect(notificationTarget('subscription_usage', admin)).toBe('/(subscription)');
});

it('leaves unknown notification types as plain, non-clickable messages', () => {
  expect(notificationTarget('something_new', admin)).toBeNull();
  expect(notificationTarget('low_stock', null)).toBeNull();
});

it('only links an employee to screens that exist for them and that they may open', () => {
  expect(notificationTarget('low_stock', employee(['products.read']))).toBe('/employee/products');
  expect(notificationTarget('low_stock', employee(['sales.write']))).toBeNull();
  expect(notificationTarget('supplier_debt', employee(['suppliers.read']))).toBe('/employee/suppliers');
  expect(notificationTarget('supplier_debt', employee([]))).toBeNull();
  expect(notificationTarget('cash_unclosed', employee(['cash_transactions.read']))).toBe('/employee/cash');
  // Écrans réservés à l'administrateur : jamais de lien côté employé.
  expect(notificationTarget('customer_debt', employee(['customers.read']))).toBeNull();
  expect(notificationTarget('employee_access_removal_request', employee(['employees.read']))).toBeNull();
  expect(notificationTarget('support_ticket_new', employee([]))).toBeNull();
  // Refus de sa demande de retrait : renvoyé vers ses Paramètres, où le motif s'affiche.
  expect(notificationTarget('employee_access_removal_rejected', employee([]))).toBe('/employee/settings');
  expect(notificationTarget('employee_access_removal_rejected', admin)).toBeNull();
});
