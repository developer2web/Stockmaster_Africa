import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), auth: { getUser: vi.fn() } }));
vi.mock('@/services/supabase/client', () => ({ supabase: backend }));
import { accessDiagnosticReport, diagnoseAccess } from '@/features/auth/accessDiagnostics';
import type { MembershipContext } from '@/types/database';

const membership = { companyId: 'company', storeId: 'store', role: 'company_admin' } as MembershipContext;
function response(data: unknown, error: unknown = null) { return { abortSignal: () => Promise.resolve({ data, error }) }; }
beforeEach(() => {
  backend.auth.getUser.mockResolvedValue({ data: { user: { id: 'private-user', email: 'private@example.invalid' } }, error: null });
  backend.rpc.mockImplementation(name => response(name === 'get_account_access_status' ? 'active' : name === 'has_permission' ? true : name === 'get_workspace_context' ? [{ company_id: 'company', store_id: 'store', role: 'company_admin' }] : []));
  backend.from.mockImplementation(() => {
    const builder = { select: () => builder, eq: () => builder, limit: () => builder, ...response([{ id: 'private-business-record' }]) };
    return builder;
  });
});
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });

describe('read-only access diagnostics', () => {
  it('reports checks without copying returned business or identity data', async () => {
    const result = await diagnoseAccess(membership);
    expect(result).toHaveLength(12);
    expect(result.every(item => item.ok)).toBe(true);
    const report = accessDiagnosticReport(result);
    expect(report).not.toContain('private-');
    expect(report).not.toContain('@');
    expect(report).not.toContain('company_admin');
  });

  it('distinguishes a missing access function from a financial permission refusal', async () => {
    backend.rpc.mockImplementation(name => response(null, { code: 'PGRST202', message: `Could not find the function ${name} in the schema cache` }));
    backend.from.mockImplementation(() => {
      const builder = { select: () => builder, eq: () => builder, limit: () => builder, ...response(null, { code: '42501', message: 'permission denied' }) };
      return builder;
    });
    const result = await diagnoseAccess(membership, 'sale');
    expect(result.find(item => item.operation === 'get_sale_detail_safe')).toMatchObject({ ok: false, kind: 'configuration', code: 'PGRST202' });
    expect(result.find(item => item.operation === 'sale_financials')).toMatchObject({ ok: false, kind: 'permission', code: '42501' });
    expect(result.find(item => item.operation === 'sale_item_financials')).toMatchObject({ ok: false, kind: 'permission', code: '42501' });
  });

  it('stops before business reads if the session is invalid', async () => {
    backend.auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401, message: 'JWT expired' } });
    expect(await diagnoseAccess(membership)).toEqual([{ label: 'Session', operation: 'auth.getUser', ok: false, kind: 'session' }]);
    expect(backend.rpc).not.toHaveBeenCalled();
    expect(backend.from).not.toHaveBeenCalled();
  });

  it('flags an empty financial result for the selected sale instead of reporting success', async () => {
    backend.from.mockImplementation((table) => {
      const builder = { select: () => builder, eq: (column: string, value: string) => {
        if (table === 'sale_financials' && column === 'sale_id') expect(value).toBe('selected-sale');
        return builder;
      }, limit: () => builder, ...response([]) };
      return builder;
    });
    const result = await diagnoseAccess(membership, 'selected-sale');
    expect(result.find(item => item.operation === 'sale_financials')).toMatchObject({ ok: false });
  });

  it('does not probe financial views or purchase prices for an employee', async () => {
    const select = vi.fn();
    backend.from.mockImplementation(() => {
      const builder = { select: (columns: string) => { select(columns); return builder; }, eq: () => builder, limit: () => builder, ...response([]) };
      return builder;
    });
    await diagnoseAccess({ ...membership, role: 'employee' }, 'sale');
    expect(backend.from).not.toHaveBeenCalledWith('sale_financials');
    expect(backend.from).not.toHaveBeenCalledWith('sale_item_financials');
    expect(select.mock.calls.flat().join(',')).not.toContain('purchase_price');
  });

  it('finishes with a connection result if the session check never replies', async () => {
    vi.useFakeTimers();
    backend.auth.getUser.mockReturnValue(new Promise(() => {}));
    const run = diagnoseAccess(membership);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await run).toEqual([{ label: 'Session', operation: 'auth.getUser', ok: false, kind: 'network' }]);
  });
});
