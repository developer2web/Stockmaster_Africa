import { plural } from './plural';
type Rule=[RegExp,(technical:string,match:RegExpMatchArray)=>string];
export type ErrorKind = 'network' | 'session' | 'permission' | 'subscription' | 'configuration' | 'server' | 'unknown';

export function errorKind(error: unknown): ErrorKind {
  const value = error as { code?: string; status?: number } | null;
  const code = value?.code ?? '';
  const message = technicalMessage(error);
  // Function/table names can contain "access" or "session": inspect schema errors first.
  if (/^(PGRST20[0-5]|42P01|42703|42883)$/.test(code) || /schema cache|relation .+ does not exist|column .+ does not exist|could not find (?:the )?function|function .+ does not exist/i.test(message)) return 'configuration';
  if (value?.status === 401 || /^PGRST30[123]$/.test(code) || /jwt|refresh token|session (?:has )?expired|session.*expir|reconnectez-vous/i.test(message)) return 'session';
  // Plusieurs RPC (create_sale, create_product_with_initial_stock...) lèvent un seul
  // message générique pour 3 causes différentes (boutique invalide, abonnement
  // inactif, permission manquante) — sans ce test avant la règle "permission"
  // ci-dessous, un propriétaire dont l'essai/abonnement est expiré recevait
  // "vous n'avez pas l'autorisation", alors que lui seul a pourtant tous les
  // droits : message trompeur, pris pour un bug d'accès (retour testeur du 15/09).
  if (/abonnement inactif|abonnement expiré|subscription inactive|subscription expired/i.test(message)) return 'subscription';
  if (value?.status === 403 || code === '42501' || /permission denied|permission refusée|row.level security|access denied|acc[eè]s refus[eé]|unauthorized|forbidden|pas l’autorisation|not authorized/i.test(message)) return 'permission';
  if (/failed to fetch|network request failed|fetch failed|networkerror|load failed|timed? ?out|timeout|met trop de temps à répondre|socket|hors ligne|connexion internet indisponible/i.test(message)) return 'network';
  if (typeof value?.status === 'number' && value.status >= 500) return 'server';
  return 'unknown';
}

export function canUseOfflineFallback(error: unknown) {
  return ['network', 'server'].includes(errorKind(error));
}
// Ces deux motifs ne signalent jamais un défaut du système : ce sont des refus de
// validation attendus (l'utilisateur a lui-même déclenché le rejet). Nommés à part
// pour être réutilisés par isExpectedUserError, qui évite de les journaliser comme
// erreurs techniques auprès du Super Admin.
const insufficientStockPattern=/stock insuffisant|insufficient stock|quantit[eé] insuffisante/i;
const duplicateKeyPattern=/duplicate|unique|already exists|déjà utilisé|existe déjà/i;
const rules:Rule[]=[
  [/failed to fetch|network request failed|load failed/i,()=>`Connexion internet indisponible. Vérifiez votre réseau puis réessayez.`],
  [/printing did not complete|print(?:ing)? (?:failed|error)|unable to print|impression.*(?:échoué|impossible)/i,()=>`Impossible d’imprimer le document. Vérifiez l’imprimante ou utilisez le partage PDF, puis réessayez.`],
  [/sharing is not available|partage.*(?:indisponible|impossible)/i,()=>`Le partage de fichiers n’est pas disponible sur cet appareil.`],
  [insufficientStockPattern,(technical)=>{const amount=technical.match(/(?:disponible|available)\D*(\d+(?:[.,]\d+)?)/i)?.[1];return amount?`Quantité insuffisante : ${amount} disponible${plural(Number(amount.replace(',','.')))}.`:`Stock insuffisant pour terminer cette opération.`}],
  [duplicateKeyPattern,()=>`Cette information est déjà utilisée.`],
  // "Le montant dépasse la dette restante (450000.00)" / "...dépasse le
  // paiement restant (...)" : message Postgres brut (audit externe, SM-19)
  // — decimales et séparateur anglais, devise absente. GNF n'a pas de
  // centimes (seul pays pris en charge, voir constants/countries.ts), donc
  // arrondi à l'entier ; fr-CA (pas fr-FR) pour le séparateur de milliers,
  // comme CurrencyProvider (voir todo.txt / commits SM-08).
  [/(?:montant|paiement) dépasse la dette restante\s*\(([\d.,]+)\)/i,(_technical,match)=>`Le montant dépasse la dette restante (${Math.round(Number(match[1].replace(',','.'))).toLocaleString('fr-CA')} GNF).`],
  [/not found|introuvable/i,()=>`La donnée demandée est introuvable.`],
];
function technicalMessage(error:unknown){return error instanceof Error?error.message:typeof error==='string'?error:error&&typeof error==='object'&&'message'in error&&typeof error.message==='string'?error.message:''}
const rawTechnical=/\b(?:uncaught|typeerror|syntaxerror|referenceerror|invalid key|stack trace|schema cache|postgres|postgrest|sqlstate|error|failed|cannot|could not|undefined|promise)\b|\brelation\s+\S+\s+does not exist|\bfunction\s+\S+\s+.*schema/i;
export function userErrorMessage(error:unknown,fallback='Le serveur est momentanément indisponible. Réessayez.'){
  const kind = errorKind(error);
  if (kind === 'configuration') return 'Ce service est indisponible sur le serveur. La configuration de la base doit être vérifiée.';
  if (kind === 'session') return 'Votre session a expiré. Reconnectez-vous.';
  if (kind === 'permission') return 'Vous n’avez pas l’autorisation d’effectuer cette action.';
  if (kind === 'subscription') return 'Votre période d’essai ou votre abonnement est terminé(e). Renouvelez-le depuis Abonnement pour continuer.';
  if (kind === 'network') return 'Connexion internet indisponible. Vérifiez votre réseau puis réessayez.';
  const technical=technicalMessage(error).trim();for(const[pattern,message]of rules){const match=technical.match(pattern);if(match)return message(technical,match)}return !technical||rawTechnical.test(technical)?fallback:technical
}
export const readableError=userErrorMessage;
/**
 * Un doublon (SKU, email...) ou un stock insuffisant sont des refus de validation
 * normaux — l'utilisateur reçoit déjà un message clair. Les journaliser comme
 * erreur technique noierait le Super Admin sous des incidents qui n'en sont pas.
 */
export function isExpectedUserError(error: unknown): boolean {
  const technical = technicalMessage(error).trim();
  return duplicateKeyPattern.test(technical) || insufficientStockPattern.test(technical);
}
/**
 * supabase.functions.invoke() ne lit pas le corps de la réponse sur un statut
 * d'erreur : il faut relire error.context (la Response brute) soi-même. Si
 * cette lecture échoue pour n'importe quelle raison (pas une vraie Response,
 * corps non JSON, pas de champ "error"...), on retombe simplement sur le
 * message générique de Supabase — jamais sur une erreur technique de lecture.
 */
export async function edgeFunctionErrorMessage(error: { message: string; context?: unknown }): Promise<string> {
  const response = error.context as Response | undefined;
  if (response && typeof response.clone === 'function') {
    try {
      const body = await response.clone().json() as { error?: string; message?: string };
      const specific = body?.error || body?.message;
      if (specific) return specific;
    } catch { /* corps illisible ou non JSON : on garde le message générique */ }
  }
  return error.message;
}
export function sanitizeErrorInPlace(error:unknown,fallback?:string){
  const message=userErrorMessage(error,fallback);
  if(error instanceof Error)error.message=message;
  else if(error&&typeof error==='object'&&'message'in error){
    try{(error as {message:unknown}).message=message;}catch{/* objet d'erreur non modifiable */}
  }
  return message;
}
