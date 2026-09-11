export function accountPortalDestination(configured: string | undefined, requested: unknown, allowLocalHttp = false): URL {
  if (!configured?.trim()) throw new Error('ACCOUNT_WEB_URL doit être configurée côté serveur.');
  const portal = new URL(configured.trim());
  const localHost = portal.hostname === 'localhost' || portal.hostname === '127.0.0.1'
    || /^10\./.test(portal.hostname) || /^192\.168\./.test(portal.hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(portal.hostname);
  if (portal.username || portal.password || (portal.protocol !== 'https:' && !(allowLocalHttp && portal.protocol === 'http:' && localHost))) {
    throw new Error('Le portail Account doit utiliser une adresse HTTPS autorisée.');
  }
  if (typeof requested === 'string' && requested.trim() && new URL(requested).origin !== portal.origin) {
    throw new Error('Le portail demandé ne correspond pas au portail Account configuré côté serveur.');
  }
  portal.pathname = '/';
  portal.search = '';
  portal.hash = '';
  return portal;
}

export function accountHandoffUrl(portal: URL, companyId: string, token: string) {
  const url = new URL(portal);
  url.searchParams.set('portal', 'subscription');
  url.searchParams.set('companyId', companyId);
  // Fragments are not sent in HTTP requests or Referer headers.
  url.hash = new URLSearchParams({ handoff: token }).toString();
  return url.toString();
}
