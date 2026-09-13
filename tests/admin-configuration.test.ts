import { emailConfiguration } from '../supabase/functions/_shared/email-config';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, it } from 'vitest';
function endpoint({ signedIn = true, superAdmin = true, secured = true, configured = true } = {}) {
  let handler!: (request: Request) => Promise<Response>;
  const calls: string[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'fixture' } : null }, error: null }) },
    rpc: async (name: string) => {
      calls.push(name);
      return name === 'super_admin_billing_email_settings' ? { error: secured ? null : { message: 'MFA_REQUIRED' } } : { data: superAdmin, error: null };
    },
  };
  const source = readFileSync('supabase/functions/super-admin-configuration/index.ts', 'utf8').replace(/^import .*;\n/gm, '');
  const context = createContext({ emailConfiguration, createClient: () => client, Response,
    corsHeaders: () => ({}), json: (_request: Request, body: unknown, status = 200) => Response.json(body, { status }),
    Deno: { serve: (value: typeof handler) => { handler = value; }, env: { get: (key: string) => !configured ? '' : key === 'RESEND_API_KEY' ? 'secret-never-returned' : key === 'NOTIFICATION_FROM_EMAIL' ? 'StockMaster <notifications@example.invalid>' : 'fixture' } },
  });
  runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { run: () => handler(new Request('https://edge.example.invalid', { method: 'POST' })), calls };
}
it('returns configuration presence only to a verified Super Admin', async () => {
  const response = await endpoint().run();
  expect(response.status).toBe(200);
  const data = await response.text();
  expect(data).not.toContain('secret-never-returned');
  expect(data).not.toContain('notifications@example');
  expect(JSON.parse(data)).toMatchObject({ email: { apiKeyConfigured: true, senderConfigured: true, senderValid: true } });
});
it.each([{ signedIn: false, status: 401 }, { superAdmin: false, status: 403 }, { secured: false, status: 403 }])('rejects an unauthorized configuration request %j', async ({ status, ...options }) => {
  expect((await endpoint(options).run()).status).toBe(status);
});
it('reports missing email settings instead of claiming email delivery works', async () => {
  const response = await endpoint({ configured: false }).run();
  expect(await response.json()).toMatchObject({ email: { apiKeyConfigured: false, senderConfigured: false, senderValid: false } });
});
