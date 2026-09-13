import { emailConfiguration } from '../supabase/functions/_shared/email-config';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, it } from 'vitest';

function endpoint({ authorized = true, claim = true, ageHours = 0 } = {}) {
  let handler!: (request: Request) => Promise<Response>;
  const deliveries: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const job = { id: 'e4300000-0000-4000-8000-000000000001', recipient_email: 'owner@example.invalid', subject: 'Reçu <test>', text_body: 'Payé\n<script>unsafe</script>', status: 'pending', attempts: 0 };
  let eligible = true;
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'in', 'gte', 'lte', 'lt', 'order', 'limit', 'eq']) query[method] = () => query;
  query.gte = (_column: string, cutoff: string) => { eligible = Date.now() - ageHours * 3_600_000 >= Date.parse(cutoff); return query; };
  query.update = (value: Record<string, unknown>) => { updates.push(value); return query; };
  query.then = (resolve: (value: unknown) => void) => resolve({ data: eligible ? [job] : [], error: null });
  const source = readFileSync('supabase/functions/notification-email/index.ts', 'utf8').replace(/^import .*;\n/gm, '');
  const context = createContext({ emailConfiguration, Response, AbortSignal,
    createClient: () => ({ from: () => query, rpc: async (name: string) => ({ data: name === 'verify_notification_webhook_secret' ? authorized : claim ? [{ ...job, attempts: 1 }] : [], error: null }) }),
    fetch: async (_url: string, options: { body: string }) => { deliveries.push(JSON.parse(options.body)); return Response.json({ id: 'resend-fixture' }); },
    corsHeaders: () => ({}), json: (_request: Request, body: unknown, status = 200) => Response.json(body, { status }),
    Deno: { serve: (value: typeof handler) => { handler = value; }, env: { get: () => 'fixture' } },
  });
  runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { deliveries, updates, run: () => handler(new Request('https://edge.example.invalid', { method: 'POST', body: '{}' })) };
}
it('rejects an unauthenticated dispatch without sending', async () => {
  const test = endpoint({ authorized: false });
  expect((await test.run()).status).toBe(401);
  expect(test.deliveries).toHaveLength(0);
});
it('does not send a canceled reminder or a concurrently claimed job', async () => {
  const test = endpoint({ claim: false });
  expect((await test.run()).status).toBe(200);
  expect(test.deliveries).toHaveLength(0);
  expect(test.updates).toHaveLength(0);
});
it('sends a claimed receipt with escaped HTML and records acceptance', async () => {
  const test = endpoint();
  expect((await test.run()).status).toBe(200);
  expect(test.deliveries).toHaveLength(1);
  expect(test.deliveries[0].html).toContain('&lt;script&gt;');
  expect(test.deliveries[0].html).not.toContain('<script>');
  expect(test.updates).toContainEqual(expect.objectContaining({ status: 'sent', provider_reference: 'resend-fixture' }));
});

it('does not revive notifications older than the 48-hour retention window', async () => {
  const test = endpoint({ ageHours: 49 });
  expect((await test.run()).status).toBe(200);
  expect(test.deliveries).toHaveLength(0);
});
