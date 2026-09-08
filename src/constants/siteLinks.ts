export const sitePorts = { marketing: 4000, account: 4001, admin: 4002, app: 8081 } as const;
export type SiteName = keyof typeof sitePorts;
const productionUrls: Record<SiteName, string> = {
  marketing: 'https://stockmaster.com', account: 'https://account.stockmaster.com',
  admin: 'https://admin.stockmaster.com', app: 'https://app.stockmaster.com',
};

export function isLocalHost(host: string) {
  return /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(host);
}

export function siteUrl(site: SiteName, configured?: string, location?: { hostname: string; protocol: string }) {
  if (configured?.trim()) return configured.trim().replace(/\/$/, '');
  if (location && isLocalHost(location.hostname)) return `${location.protocol}//${location.hostname}:${sitePorts[site]}`;
  return productionUrls[site];
}
