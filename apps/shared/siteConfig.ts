import { siteUrl, type SiteName } from '../../src/constants/siteLinks';
export function webSiteUrl(site: SiteName) {
  const urls = { marketing: import.meta.env.VITE_MARKETING_URL, account: import.meta.env.VITE_ACCOUNT_URL || import.meta.env.EXPO_PUBLIC_ACCOUNT_WEB_URL, admin: import.meta.env.VITE_ADMIN_URL, app: import.meta.env.VITE_APP_URL };
  return siteUrl(site, urls[site], typeof location === 'undefined' ? undefined : location);
}
