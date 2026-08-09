import { createClient } from 'npm:@supabase/supabase-js@2';

type WebhookPayload = {
  provider?: string;
  reference?: string;
  event_id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  message?: string;
};

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const rawBody = await request.text();
    const secret = Deno.env.get('PAYMENT_WEBHOOK_SECRET');
    const supplied = request.headers.get('x-provider-signature')?.replace(/^sha256=/, '') ?? '';
    if (!secret) throw new Error('Webhook secret not configured');
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
    if (!safeEqual(expected, supplied.toLowerCase())) {
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as WebhookPayload;
    if (!payload.provider || !payload.reference || !payload.event_id || !payload.status) {
      throw new Error('Webhook incomplet');
    }
    if (!Number.isFinite(Number(payload.amount)) || !payload.currency) throw new Error('Montant ou devise absent');
    const normalizedStatus = ({
      success: 'succeeded',
      successful: 'succeeded',
      paid: 'succeeded',
      failed: 'failed',
      cancelled: 'cancelled',
      canceled: 'cancelled',
      expired: 'expired',
      pending: 'processing',
      processing: 'processing',
    } as Record<string, string>)[payload.status.toLowerCase()];
    if (!normalizedStatus) throw new Error('Statut prestataire inconnu');

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await admin.rpc('process_payment_webhook', {
      p_provider: payload.provider,
      p_provider_reference: payload.reference,
      p_provider_event_id: payload.event_id,
      p_status: normalizedStatus,
      p_amount: Number(payload.amount),
      p_currency: payload.currency.toUpperCase(),
      p_payload: payload,
    });
    if (error) throw error;
    return Response.json({ received: true, result: data });
  } catch (error) {
    console.error(JSON.stringify({
      severity: 'error',
      code: 'payment_webhook_failed',
      message: error instanceof Error ? error.message : String(error),
      at: new Date().toISOString(),
    }));
    return Response.json({ error: 'Webhook rejected' }, { status: 400 });
  }
});
