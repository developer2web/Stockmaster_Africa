// Default sender applies only to the verified StockMaster deployment.
// Other deployments must supply their own NOTIFICATION_FROM_EMAIL.
// Nom affiché « StockMaster » ajouté quand l'adresse configurée n'en a pas (26/09) :
// les emails de l'app arrivaient sans nom, ceux de Supabase avec « Stock Master ».
export const SENDER_NAME = 'StockMaster';
function withSenderName(address: string) {
  return !address || address.includes('<') ? address : `${SENDER_NAME} <${address}>`;
}
export function emailConfiguration(getEnv: (name: string) => string | undefined) {
  const projectUrl = getEnv('SUPABASE_URL')?.replace(/\/$/, '');
  const from = getEnv('NOTIFICATION_FROM_EMAIL')?.trim()
    || (projectUrl === 'https://mwpbinlxablzruvpjjjy.supabase.co' ? 'noreply@stockmaster.africa' : '');
  return { apiKey: getEnv('RESEND_API_KEY')?.trim() ?? '', from: withSenderName(from) };
}
