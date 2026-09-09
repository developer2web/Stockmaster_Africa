import { supabase } from '@/services/supabase/client';
import { errorKind, type ErrorKind } from '@/utils/errors';
import type { MembershipContext } from '@/types/database';

export type AccessCheck = { label: string; operation: string; ok: boolean; kind?: ErrorKind; code?: string };
type Result = { data: unknown; error: unknown };

async function check(label: string, operation: string, run: (signal: AbortSignal) => PromiseLike<Result>, valid?: (data: unknown) => boolean): Promise<AccessCheck> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => run(controller.signal)),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Diagnostic timeout')); }, 10_000); }),
    ]);
    if (result.error) throw result.error;
    return { label, operation, ok: valid ? valid(result.data) : true };
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    return { label, operation, ok: false, kind: errorKind(error), ...(typeof code === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(code) ? { code } : {}) };
  } finally { if (timer) clearTimeout(timer); }
}

/** Read-only probes. Never include tokens, user identities or returned business data. */
export async function diagnoseAccess(membership: MembershipContext | null, saleId?: string): Promise<AccessCheck[]> {
  const session = await check('Session', 'auth.getUser', () => supabase.auth.getUser(), data => !!(data as { user?: unknown })?.user);
  if (!session.ok) return [session];
  if (!membership?.companyId || !membership.storeId) return [session, { label: 'Boutique sélectionnée', operation: 'workspace', ok: false }];
  const { companyId, storeId } = membership;
  const queries = [
    check('État du compte', 'get_account_access_status', signal => supabase.rpc('get_account_access_status').abortSignal(signal), data => data === 'active'),
    check('Entreprise et boutique', 'get_workspace_context', signal => supabase.rpc('get_workspace_context', { p_company_id: companyId, p_store_id: storeId }).abortSignal(signal), data => {
      const row = Array.isArray(data) ? data[0] : data;
      return row?.company_id === companyId && row?.store_id === storeId && row?.role === membership.role;
    }),
    check('Droit de consulter les ventes', 'has_permission', signal => supabase.rpc('has_permission', { p_company: companyId, p_code: 'sales.read' }).abortSignal(signal), data => data === true),
    check('Historique des ventes', 'get_sales_history_safe', signal => supabase.rpc('get_sales_history_safe', { p_company_id: companyId, p_store_id: storeId, p_offset: 0, p_limit: 1 }).abortSignal(signal)),
    check('Produits', 'products', signal => supabase.from('products').select('id,name,sale_price').eq('company_id', companyId).eq('store_id', storeId).limit(1).abortSignal(signal)),
    check('Stock', 'stock_levels', signal => supabase.from('stock_levels').select('id,quantity').eq('company_id', companyId).eq('store_id', storeId).limit(1).abortSignal(signal)),
    check('Clients', 'customers', signal => supabase.from('customers').select('id').eq('company_id', companyId).eq('store_id', storeId).limit(1).abortSignal(signal)),
  ];
  if (saleId) queries.push(check('Détail de la vente', 'get_sale_detail_safe', signal => supabase.rpc('get_sale_detail_safe', { p_sale_id: saleId }).abortSignal(signal), data => !!data));
  if (membership.role === 'company_admin') queries.push(
    check('Bénéfices', 'sale_financials', signal => {
      let query = supabase.from('sale_financials').select('sale_id,cost_total,gross_profit').eq('company_id', companyId).eq('store_id', storeId);
      if (saleId) query = query.eq('sale_id', saleId);
      return query.limit(1).abortSignal(signal);
    }, saleId ? data => Array.isArray(data) && data.length > 0 : undefined),
    check('Coûts des articles', 'sale_item_financials', signal => {
      let query = supabase.from('sale_item_financials').select('sale_item_id,purchase_price_snapshot,gross_profit').eq('company_id', companyId);
      if (saleId) query = query.eq('sale_id', saleId);
      return query.limit(1).abortSignal(signal);
    }),
    check('Caisse', 'cash_transactions', signal => supabase.from('cash_transactions').select('id,amount').eq('company_id', companyId).eq('store_id', storeId).limit(1).abortSignal(signal)),
    check('Dépenses', 'expenses', signal => supabase.from('expenses').select('id,amount').eq('company_id', companyId).eq('store_id', storeId).limit(1).abortSignal(signal)),
  );
  return [session, ...await Promise.all(queries)];
}

export function accessCheckMessage(check: AccessCheck) {
  if (check.ok) return 'Réponse reçue';
  switch (check.kind) {
    case 'permission': return 'Accès refusé par le serveur';
    case 'session': return 'Session à renouveler';
    case 'configuration': return 'Configuration serveur à vérifier';
    case 'network': return 'Connexion ou délai de réponse à vérifier';
    case 'server': return 'Serveur indisponible';
    default: return 'Accès à vérifier';
  }
}

export function accessDiagnosticReport(checks: AccessCheck[]) {
  return ['Diagnostic StockMaster', new Date().toISOString(), ...checks.map(item => `${item.label} (${item.operation}) : ${accessCheckMessage(item)}${item.code ? ` [${item.code}]` : ''}`)].join('\n');
}
