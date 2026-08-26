import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';

type EmailJob = {
  id: string;
  recipient_email: string;
  subject: string;
  text_body: string;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  attempts: number;
};

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function pendingJobs(jobId?: string) {
  let query = admin.from('notification_email_outbox')
    .select('id,recipient_email,subject,text_body,status,attempts')
    .in('status', ['pending', 'failed'])
    .lte('next_attempt_at', new Date().toISOString())
    .lt('attempts', 8)
    .order('created_at')
    .limit(jobId ? 1 : 25);
  if (jobId) query = query.eq('id', jobId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as EmailJob[];
}

async function processJob(job: EmailJob) {
  const { data: claimed, error: claimError } = await admin
    .from('notification_email_outbox')
    .update({ status: 'processing', attempts: job.attempts + 1, last_error: null })
    .eq('id', job.id)
    .in('status', ['pending', 'failed'])
    .select('id,recipient_email,subject,text_body,status,attempts')
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { id: job.id, status: 'already-claimed' };

  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim();
  const from = Deno.env.get('NOTIFICATION_FROM_EMAIL')?.trim();
  if (!apiKey || !from) {
    await admin.from('notification_email_outbox').update({
      status: 'pending',
      attempts: job.attempts,
      next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      last_error: 'RESEND_API_KEY ou NOTIFICATION_FROM_EMAIL non configuré',
    }).eq('id', job.id);
    return { id: job.id, status: 'waiting-for-email-configuration' };
  }

  const safeSubject = escapeHtml(job.subject);
  const safeBody = escapeHtml(job.text_body).replaceAll('\n', '<br/>');
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `stockmaster-notification-${job.id}`,
      },
      body: JSON.stringify({
        from,
        to: [job.recipient_email],
        subject: job.subject,
        text: job.text_body,
        html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#123b39"><div style="padding:18px 22px;background:#0f4d4f;color:white;border-radius:16px 16px 0 0"><strong style="font-size:22px">StockMaster</strong></div><div style="padding:24px;border:1px solid #d7e4e1;border-top:0;border-radius:0 0 16px 16px"><h2 style="margin-top:0">${safeSubject}</h2><p style="font-size:16px;line-height:1.6">${safeBody}</p><p style="color:#667b78;font-size:13px">Message transactionnel automatique envoyé par StockMaster.</p></div></div>`,
      }),
    });
    const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok) throw new Error(payload.message || `Resend HTTP ${response.status}`);
    await admin.from('notification_email_outbox').update({
      status: 'sent', provider_reference: payload.id ?? null,
      sent_at: new Date().toISOString(), last_error: null,
    }).eq('id', job.id);
    return { id: job.id, status: 'sent' };
  } catch (error) {
    const attempts = job.attempts + 1;
    const delayMinutes = Math.min(60, 2 ** Math.min(attempts, 5));
    await admin.from('notification_email_outbox').update({
      status: 'failed',
      next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
      last_error: error instanceof Error ? error.message.slice(0, 1000) : 'Erreur email inconnue',
    }).eq('id', job.id);
    return { id: job.id, status: 'failed' };
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);
  try {
    const webhookSecret = request.headers.get('X-StockMaster-Webhook') ?? '';
    const { data: authorized, error: authorizationError } = await admin.rpc('verify_notification_webhook_secret', { p_secret: webhookSecret });
    if (authorizationError || !authorized) return json(request, { error: 'Accès refusé' }, 401);
    const body = await request.json().catch(() => ({})) as { jobId?: string };
    if (body.jobId && !/^[0-9a-f-]{36}$/i.test(body.jobId)) {
      return json(request, { error: 'Identifiant invalide' }, 400);
    }
    const jobs = await pendingJobs(body.jobId);
    const results = [];
    for (const job of jobs) results.push(await processJob(job));
    return json(request, { processed: results.length, results });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : 'Erreur inconnue' }, 500);
  }
});
