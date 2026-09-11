import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as operationHelpers from '../supabase/functions/_shared/paymentOperation';
import { toStripeMinorUnits } from '../supabase/functions/_shared/currency';

const requestInput = {
  companyId: 'company-test', planId: 'plan-test', operationId: '10000000-0000-4000-8000-000000000001',
  billingCycle: 'monthly' as const, provider: 'stripe',
};
const initialOperation = () => ({
  id: 'payment-test', client_id: 'owner-test', company_id: 'company-test', plan_id: 'plan-test',
  operation_id: requestInput.operationId, billing_cycle: 'monthly', provider: 'stripe', phone_number: null,
  retained_company_id: null, promotion_id: null, amount: 100, currency: 'GNF',
  request_details: operationHelpers.paymentRequestDetails(requestInput), status: 'pending',
  provider_reference: null as string | null, provider_payload: null as Record<string, unknown> | null,
});

function harness(existing: ReturnType<typeof initialOperation> | null = null) {
  let record = existing;
  let claimed = false;
  let inserts = 0;
  const fetch = vi.fn<(input: string, init: RequestInit) => Promise<Response>>().mockResolvedValue(Response.json({ id: 'cs_existing', url: 'https://checkout.stripe.com/existing' }));
  const rpc = vi.fn(async (name: string) => {
    if (name === 'claim_payment_provider_request') {
      const result = !claimed && record?.status === 'pending' && !record.provider_reference;
      if (result) claimed = true;
      return { data: result, error: null };
    }
    return { data: name === 'subscription_quote' ? { base_amount: 100, discount_amount: 0, final_amount: 100, bonus_days: 0, promotion_id: null, currency: 'GNF' } : null, error: null };
  });
  class Query {
    constructor(private table: string) {}
    select() { return this; }
    eq() { return this; }
    limit() { return this; }
    async maybeSingle() { return { data: this.table === 'payment_transactions' ? record ? { ...record } : null : { company_id: 'company-test' }, error: null }; }
    async single() { return { data: { id: 'plan-test', name: 'Plan', currency: 'GNF', is_active: true }, error: null }; }
    async upsert(value: ReturnType<typeof initialOperation>, options: { ignoreDuplicates: boolean }) {
      inserts += 1;
      if (!record || !options.ignoreDuplicates) record = { ...initialOperation(), ...record, ...value };
      return { error: null };
    }
    update(value: Partial<ReturnType<typeof initialOperation>>) {
      if (record) record = { ...record, ...value };
      return this;
    }
    async insert() { return { error: null }; }
    then(resolve: (value: { error: null }) => void) { resolve({ error: null }); }
  }
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'owner-test' } }, error: null }) }, rpc, from: (table: string) => new Query(table) };
  // Execute the real Deno handler with isolated transports; no live payment or
  // network call is made. Its pure imports remain the actual shared helpers.
  const source = readFileSync('supabase/functions/_shared/payment.ts', 'utf8').replace(/^import .*;\n/gm, '').replace('export async function', 'async function');
  const context = createContext({
    ...operationHelpers, toStripeMinorUnits, createClient: () => client, fetch, Response, URLSearchParams, AbortSignal,
    Deno: { env: { get: (name: string) => name.endsWith('_URL') ? 'https://account.example.test' : 'test-configuration' } },
    corsHeaders: () => ({}), json: (_request: Request, body: unknown, status = 200) => Response.json(body, { status }),
  });
  runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const handle = context.handleCreatePayment as (request: Request) => Promise<Response>;
  return { handle: (body = requestInput) => handle(new Request('https://edge.example.test', { method: 'POST', body: JSON.stringify(body) })), getRecord: () => record, getInserts: () => inserts, fetch, rpc };
}

describe('create-payment handler regression', () => {
  it('never rewrites an already paid operation or requests another checkout', async () => {
    const fixture = harness({ ...initialOperation(), status: 'succeeded', provider_reference: 'cs_paid' });
    const response = await fixture.handle();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'succeeded', providerReference: 'cs_paid' });
    expect(fixture.getRecord()?.status).toBe('succeeded');
    expect(fixture.getInserts()).toBe(0);
    expect(fixture.fetch).not.toHaveBeenCalled();
    expect(fixture.rpc).not.toHaveBeenCalledWith('subscription_quote', expect.anything());
  });
  it('serializes concurrent creation and reuses the same Stripe checkout', async () => {
    const fixture = harness();
    const results = await Promise.all([fixture.handle(), fixture.handle()]);
    expect(results.every(result => result.status === 200)).toBe(true);
    expect(fixture.fetch).toHaveBeenCalledTimes(1);
    expect(fixture.fetch.mock.calls[0][1]).toMatchObject({ headers: { 'Idempotency-Key': 'stockmaster-payment-payment-test' } });
    const retry = await fixture.handle();
    expect(await retry.json()).toMatchObject({ status: 'processing', authorizationUrl: 'https://checkout.stripe.com/existing' });
    expect(fixture.fetch).toHaveBeenCalledTimes(1);
  });
  it('does not retry a Mobile Money request whose response was lost', async () => {
    const fixture = harness();
    fixture.fetch.mockRejectedValue(new Error('Connection interrupted'));
    const input = { ...requestInput, provider: 'orange', phoneNumber: '+224620000000' };
    expect((await fixture.handle(input)).status).toBe(400);
    expect(fixture.rpc).not.toHaveBeenCalledWith('release_payment_provider_request', expect.anything());
    const retry = await fixture.handle(input);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ status: 'pending' });
    expect(fixture.fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects changing an existing payment plan before any mutation', async () => {
    const fixture = harness({ ...initialOperation(), status: 'succeeded', provider_reference: 'cs_paid' });
    const response = await fixture.handle({ ...requestInput, planId: 'plan-other' });
    expect(response.status).toBe(400);
    expect(fixture.getRecord()?.plan_id).toBe('plan-test');
    expect(fixture.getInserts()).toBe(0);
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
});
