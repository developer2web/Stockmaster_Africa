type Rule=[RegExp,(technical:string,match:RegExpMatchArray)=>string];
export type ErrorKind = 'network' | 'session' | 'permission' | 'configuration' | 'server' | 'unknown';

export function errorKind(error: unknown): ErrorKind {
  const value = error as { code?: string; status?: number } | null;
  const code = value?.code ?? '';
  const message = technicalMessage(error);
  // Function/table names can contain "access" or "session": inspect schema errors first.
  if (/^(PGRST20[0-5]|42P01|42703|42883)$/.test(code) || /schema cache|relation .+ does not exist|column .+ does not exist|could not find (?:the )?function|function .+ does not exist/i.test(message)) return 'configuration';
  if (value?.status === 401 || /^PGRST30[123]$/.test(code) || /jwt|refresh token|session (?:has )?expired|session.*expir|reconnectez-vous/i.test(message)) return 'session';
  if (value?.status === 403 || code === '42501' || /permission denied|permission refusée|row.level security|access denied|acc[eè]s refus[eé]|unauthorized|forbidden|pas l’autorisation|not authorized/i.test(message)) return 'permission';
  if (/failed to fetch|network request failed|fetch failed|networkerror|load failed|timed? ?out|timeout|met trop de temps à répondre|socket|hors ligne|connexion internet indisponible/i.test(message)) return 'network';
  if (typeof value?.status === 'number' && value.status >= 500) return 'server';
  return 'unknown';
}

export function canUseOfflineFallback(error: unknown) {
  return ['network', 'server'].includes(errorKind(error));
}
const rules:Rule[]=[
  [/failed to fetch|network request failed|load failed/i,()=>`Connexion internet indisponible. Vérifiez votre réseau puis réessayez.`],
  [/printing did not complete|print(?:ing)? (?:failed|error)|unable to print|impression.*(?:échoué|impossible)/i,()=>`Impossible d’imprimer le document. Vérifiez l’imprimante ou utilisez le partage PDF, puis réessayez.`],
  [/sharing is not available|partage.*(?:indisponible|impossible)/i,()=>`Le partage de fichiers n’est pas disponible sur cet appareil.`],
  [/stock insuffisant|insufficient stock|quantit[eé] insuffisante/i,(technical)=>{const amount=technical.match(/(?:disponible|available)\D*(\d+(?:[.,]\d+)?)/i)?.[1];return amount?`Quantité insuffisante : ${amount} disponible(s).`:`Stock insuffisant pour terminer cette opération.`}],
  [/duplicate|unique|already exists|déjà utilisé|existe déjà/i,()=>`Cette information est déjà utilisée.`],
  [/not found|introuvable/i,()=>`La donnée demandée est introuvable.`],
];
function technicalMessage(error:unknown){return error instanceof Error?error.message:typeof error==='string'?error:error&&typeof error==='object'&&'message'in error&&typeof error.message==='string'?error.message:''}
const rawTechnical=/\b(?:uncaught|typeerror|syntaxerror|referenceerror|invalid key|stack trace|schema cache|postgres|postgrest|sqlstate|error|failed|cannot|could not|undefined|promise)\b|\brelation\s+\S+\s+does not exist|\bfunction\s+\S+\s+.*schema/i;
export function userErrorMessage(error:unknown,fallback='Le serveur est momentanément indisponible. Réessayez.'){
  const kind = errorKind(error);
  if (kind === 'configuration') return 'Ce service est indisponible sur le serveur. La configuration de la base doit être vérifiée.';
  if (kind === 'session') return 'Votre session a expiré. Reconnectez-vous.';
  if (kind === 'permission') return 'Vous n’avez pas l’autorisation d’effectuer cette action.';
  if (kind === 'network') return 'Connexion internet indisponible. Vérifiez votre réseau puis réessayez.';
  const technical=technicalMessage(error).trim();for(const[pattern,message]of rules){const match=technical.match(pattern);if(match)return message(technical,match)}return !technical||rawTechnical.test(technical)?fallback:technical
}
export const readableError=userErrorMessage;
export function sanitizeErrorInPlace(error:unknown,fallback?:string){
  const message=userErrorMessage(error,fallback);
  if(error instanceof Error)error.message=message;
  else if(error&&typeof error==='object'&&'message'in error){
    try{(error as {message:unknown}).message=message;}catch{/* objet d'erreur non modifiable */}
  }
  return message;
}
