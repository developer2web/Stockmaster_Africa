import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);
  try {
    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) throw new Error('Non authentifié');
    const { transactionId } = await request.json() as { transactionId?: string };
    if (!transactionId) throw new Error('Transaction requise');
    const { data, error } = await caller.from('payment_transactions')
      .select('id,status,subscription:subscriptions(status)')
      .eq('id', transactionId)
      .single();
    if (error || !data) throw new Error('Transaction introuvable');
    const subscription = Array.isArray(data.subscription) ? data.subscription[0] : data.subscription;
    return json(request, {
      transactionId: data.id,
      status: data.status,
      subscriptionStatus: subscription?.status ?? null,
    });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : 'Erreur inconnue' }, 400);
  }
});
