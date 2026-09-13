// Default sender applies only to the verified StockMaster deployment.
// Other deployments must supply their own NOTIFICATION_FROM_EMAIL.
export function emailConfiguration(getEnv: (name: string) => string | undefined) {
  const projectUrl = getEnv('SUPABASE_URL')?.replace(/\/$/, '');
  const from = getEnv('NOTIFICATION_FROM_EMAIL')?.trim()
    || (projectUrl === 'https://mwpbinlxablzruvpjjjy.supabase.co' ? 'noreply@stockmaster.africa' : '');
  return { apiKey: getEnv('RESEND_API_KEY')?.trim() ?? '', from };
}
