import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';

// Remboursement Super Admin d'un paiement confirmé. Pour Orange Money manuel
// (aucune API externe), le résultat est enregistré directement par la RPC —
// l'admin confirme ici avoir déjà renvoyé l'argent au client par ailleurs.
// Pour Stripe, un vrai remboursement est déclenché via l'API Stripe (le
// PaymentIntent est résolu depuis la Checkout Session enregistrée comme
// provider_reference) avant tout enregistrement en base, exactement comme
// create-payment appelle Stripe puis écrit le résultat.
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authorization = request.headers.get('Authorization') ?? '';
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) throw new Error('Non authentifié');
    const { error: securityError } = await caller.rpc('assert_session_security', { p_allow_temporary_password: false });
    if (securityError) throw securityError;

    const { data: profile, error: profileError } = await admin.from('profiles').select('is_super_admin').eq('id', user.id).single();
    if (profileError || !profile?.is_super_admin) throw new Error('Accès Super Admin requis');

    const body = await request.json() as { paymentId?: string; reason?: string };
    const paymentId = body.paymentId?.trim() ?? '';
    const reason = body.reason?.trim() ?? '';
    if (!paymentId) throw new Error('Paiement requis');
    if (reason.length < 3) throw new Error('Le motif du remboursement est obligatoire');

    const { data: payment, error: paymentError } = await admin.from('payment_transactions')
      .select('id,provider,provider_reference,status')
      .eq('id', paymentId)
      .single();
    if (paymentError || !payment) throw new Error('Paiement introuvable');
    if (payment.status === 'refunded') return json(request, { ok: true, alreadyRefunded: true });
    if (payment.status !== 'succeeded') throw new Error('Seul un paiement confirmé peut être remboursé');

    let refundReference: string | null = null;

    if (payment.provider === 'stripe') {
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
      if (!stripeKey) throw new Error('Stripe n’est pas encore configuré');
      if (!payment.provider_reference) throw new Error('Référence Stripe absente pour ce paiement');

      const sessionResponse = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(payment.provider_reference)}`,
        { headers: { Authorization: `Bearer ${stripeKey}` }, signal: AbortSignal.timeout(30_000) },
      );
      const session = await sessionResponse.json() as Record<string, unknown>;
      if (!sessionResponse.ok) {
        console.error('stripe session lookup failed', sessionResponse.status, JSON.stringify(session));
        const stripeError = session.error as { message?: string } | undefined;
        throw new Error(stripeError?.message ? `Stripe : ${stripeError.message}` : 'Session Stripe introuvable pour ce paiement');
      }
      const rawIntent = session.payment_intent as string | { id?: string } | null;
      const paymentIntentId = typeof rawIntent === 'string' ? rawIntent : rawIntent?.id;
      if (!paymentIntentId) throw new Error('Aucun paiement Stripe finalisé pour cette session');

      const refundResponse = await fetch('https://api.stripe.com/v1/refunds', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': `stockmaster-refund-${payment.id}`,
        },
        body: new URLSearchParams({ payment_intent: paymentIntentId, reason: 'requested_by_customer' }).toString(),
        signal: AbortSignal.timeout(30_000),
      });
      const refund = await refundResponse.json() as Record<string, unknown>;
      if (!refundResponse.ok || typeof refund.id !== 'string') {
        console.error('stripe refund failed', refundResponse.status, JSON.stringify(refund));
        const stripeError = refund.error as { message?: string } | undefined;
        throw new Error(stripeError?.message ? `Stripe : ${stripeError.message}` : 'Le remboursement Stripe a échoué');
      }
      refundReference = refund.id;
    }
    // Orange Money manuel : aucun appel externe — refundReference reste null,
    // le motif saisi par l'admin sert de trace de l'action manuelle déjà faite.

    const { error: recordError } = await caller.rpc('super_admin_manage_payment', {
      p_payment_id: paymentId,
      p_action: 'refund',
      p_reason: reason,
      p_refund_reference: refundReference,
    });
    if (recordError) throw recordError;

    return json(request, { ok: true, refundReference });
  } catch (error) {
    console.error('refund-payment failed', error);
    return json(request, { error: error instanceof Error ? error.message : 'Erreur inconnue' }, 400);
  }
});
