import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { fromStripeMinorUnits } from '../_shared/currency.ts';

// Filet de sécurité pour un webhook Stripe qui n'arriverait jamais (incident
// réseau, redémarrage au mauvais moment...). Appelé par cron toutes les 20
// minutes : interroge Stripe directement pour chaque paiement Stripe resté
// pending/processing depuis plus de 15 minutes côté StockMaster, et le
// corrige via la MÊME RPC que le webhook (process_payment_webhook) si Stripe
// dit que la session est en fait terminée (payée ou expirée). Ne fait jamais
// l'inverse : un paiement déjà 'succeeded' localement n'est jamais retouché
// (process_payment_webhook s'en charge lui-même, en sortie anticipée).
// Authentifié par le même secret interne que notification-email (appel
// serveur-à-serveur uniquement, jamais exposé publiquement).
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);
  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const webhookSecret = request.headers.get('X-StockMaster-Webhook') ?? '';
    const { data: authorized, error: authorizationError } = await admin.rpc('verify_notification_webhook_secret', { p_secret: webhookSecret });
    if (authorizationError || !authorized) return json(request, { error: 'Accès refusé' }, 401);

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) throw new Error('Stripe n’est pas encore configuré');

    const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: stale, error: staleError } = await admin.from('payment_transactions')
      .select('id,provider_reference,status')
      .eq('provider', 'stripe')
      .in('status', ['pending', 'processing'])
      .lt('created_at', staleBefore)
      .limit(50);
    if (staleError) throw staleError;

    const results: Record<string, unknown>[] = [];
    for (const row of stale ?? []) {
      if (!row.provider_reference) { results.push({ id: row.id, skipped: 'no_reference' }); continue; }

      const response = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(row.provider_reference)}`,
        { headers: { Authorization: `Bearer ${stripeKey}` }, signal: AbortSignal.timeout(20_000) },
      );
      const session = await response.json() as Record<string, unknown>;
      if (!response.ok) {
        console.error('reconcile: stripe session lookup failed', row.id, response.status, JSON.stringify(session));
        results.push({ id: row.id, skipped: 'stripe_lookup_failed' });
        continue;
      }

      const mapped = session.status === 'complete' && session.payment_status === 'paid' ? 'succeeded'
        : session.status === 'expired' ? 'expired'
        : null;
      if (!mapped) { results.push({ id: row.id, skipped: 'still_in_progress' }); continue; }

      const currency = String(session.currency ?? '').toUpperCase();
      const { data, error } = await admin.rpc('process_payment_webhook', {
        p_provider: 'stripe',
        p_provider_reference: row.provider_reference,
        p_provider_event_id: `reconcile:${row.provider_reference}`,
        p_status: mapped,
        p_amount: fromStripeMinorUnits(Number(session.amount_total ?? 0), currency),
        p_currency: currency,
        p_payload: session,
      });
      if (error) {
        console.error('reconcile: fix failed', row.id, error.message);
        results.push({ id: row.id, fixed: false, error: error.message });
        continue;
      }
      results.push({ id: row.id, fixed: true, newStatus: mapped, rpcResult: data });
    }

    return json(request, { checked: (stale ?? []).length, results });
  } catch (error) {
    console.error('reconcile-stripe-payments failed', error);
    return json(request, { error: error instanceof Error ? error.message : 'Erreur inconnue' }, 500);
  }
});
