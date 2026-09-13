import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { emailConfiguration } from '../_shared/email-config.ts';

// Formulaire "Contactez-nous" du site marketing (public, sans authentification).
// Envoie directement via Resend plutôt que par la file d'attente notification_email_outbox :
// un visiteur anonyme veut un retour immédiat (réussite/échec), pas un envoi différé.
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('cf-connecting-ip') ?? request.headers.get('x-real-ip') ?? 'unknown';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const name = String(body.name ?? '').trim().slice(0, 200);
    const email = String(body.email ?? '').trim().slice(0, 320);
    const phone = String(body.phone ?? '').trim().slice(0, 60);
    const subject = String(body.subject ?? '').trim().slice(0, 200);
    const message = String(body.message ?? '').trim().slice(0, 5000);

    if (!name || !email || !subject || !message) {
      return json(request, { error: 'Nom, email, sujet et message sont obligatoires.' }, 400);
    }
    if (!EMAIL_RE.test(email)) return json(request, { error: 'Adresse email invalide.' }, 400);

    // Un bucket par IP : généreux pour un vrai visiteur, restrictif pour un robot.
    const { data: withinLimit, error: rateLimitError } = await admin.rpc('check_rate_limit', {
      p_bucket_key: `contact-form:${clientIp(request)}`, p_max_hits: 5, p_window: '1 hour',
    });
    if (rateLimitError) throw rateLimitError;
    if (!withinLimit) return json(request, { error: 'Trop de messages envoyés depuis cette connexion. Réessayez plus tard.' }, 429);

    const { apiKey, from } = emailConfiguration((key) => Deno.env.get(key));
    const supportEmail = Deno.env.get('SUPPORT_EMAIL')?.trim();
    if (!apiKey || !from || !supportEmail) {
      return json(request, { error: 'Le service de messagerie est momentanément indisponible. Écrivez-nous directement.' }, 503);
    }

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safePhone = escapeHtml(phone || 'Non renseigné');
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message).replaceAll('\n', '<br/>');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [supportEmail],
        // Répondre à cet email répond directement au visiteur, pas à l'adresse
        // technique d'envoi : Resend n'est autorisé (SPF/DKIM) qu'à envoyer depuis
        // stockmaster.africa, jamais au nom de l'adresse du visiteur lui-même.
        reply_to: email,
        subject: `[Contact site] ${subject}`,
        text: `Nom : ${name}\nEmail : ${email}\nTéléphone : ${phone || 'Non renseigné'}\n\n${message}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#123b39"><div style="padding:18px 22px;background:#0f4d4f;color:white;border-radius:16px 16px 0 0"><strong style="font-size:22px">StockMaster</strong><div style="font-size:13px;opacity:.85">Nouveau message du formulaire de contact</div></div><div style="padding:24px;border:1px solid #d7e4e1;border-top:0;border-radius:0 0 16px 16px"><h2 style="margin-top:0">${safeSubject}</h2><table style="width:100%;border-collapse:collapse;margin-bottom:18px"><tr><td style="padding:4px 0;color:#667b78;width:90px">Nom</td><td style="padding:4px 0"><strong>${safeName}</strong></td></tr><tr><td style="padding:4px 0;color:#667b78">Email</td><td style="padding:4px 0"><a href="mailto:${safeEmail}" style="color:#0f4d4f">${safeEmail}</a></td></tr><tr><td style="padding:4px 0;color:#667b78">Téléphone</td><td style="padding:4px 0">${safePhone}</td></tr></table><p style="font-size:16px;line-height:1.6">${safeMessage}</p><p style="color:#667b78;font-size:13px">Répondre à cet email répond directement à ${safeName}.</p></div></div>`,
      }),
    });
    const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok) {
      console.error('contact_form_resend_failed', response.status, JSON.stringify(payload));
      throw new Error(payload.message || `Resend HTTP ${response.status}`);
    }
    return json(request, { ok: true });
  } catch (error) {
    console.error('contact_form_failed', error instanceof Error ? error.message : error);
    return json(request, { error: 'Impossible d’envoyer le message pour le moment. Réessayez ou écrivez-nous directement.' }, 500);
  }
});
