const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Temporaire (16/09) : les 4 domaines stockmaster.africa ne résolvent pas
// encore, les sites de test tournent sur des URLs *.vercel.app générées
// par Vercel — impossible à lister à l'avance dans ALLOWED_ORIGINS. On
// fait confiance à ce sous-domaine spécifiquement (rien d'autre n'y est
// affaibli : chaque appel reste vérifié par session/rôle côté serveur
// comme avant, ceci ne fait que permettre au navigateur de lire la
// réponse). À retirer une fois le vrai domaine branché — voir la mémoire
// de session hosting-domain-status et todo.txt (nettoyage ALLOWED_ORIGINS).
function isTrustedVercelPreview(origin: string) {
  try { return new URL(origin).hostname.endsWith('.vercel.app'); } catch { return false; }
}

export function corsHeaders(request: Request) {
  const origin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': origin && (allowedOrigins.includes(origin) || isTrustedVercelPreview(origin))
      ? origin
      : allowedOrigins[0] ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-provider-signature',
    'Vary': 'Origin',
  };
}

export function json(request: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders(request) });
}
