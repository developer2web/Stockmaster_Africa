type Rule=[RegExp,(technical:string,match:RegExpMatchArray)=>string];
const rules:Rule[]=[
  [/failed to fetch|network request failed|load failed/i,()=>`Connexion internet indisponible. Vérifiez votre réseau puis réessayez.`],
  [/printing did not complete|print(?:ing)? (?:failed|error)|unable to print|impression.*(?:échoué|impossible)/i,()=>`Impossible d’imprimer le document. Vérifiez l’imprimante ou utilisez le partage PDF, puis réessayez.`],
  [/sharing is not available|partage.*(?:indisponible|impossible)/i,()=>`Le partage de fichiers n’est pas disponible sur cet appareil.`],
  [/jwt|session|refresh token/i,()=>`Votre session a expiré. Reconnectez-vous.`],
  [/permission|row-level security|access|accès refusé|unauthorized|forbidden/i,()=>`Vous n’avez pas l’autorisation d’effectuer cette action.`],
  [/stock insuffisant|insufficient stock|quantit[eé] insuffisante/i,(technical)=>{const amount=technical.match(/(?:disponible|available)\D*(\d+(?:[.,]\d+)?)/i)?.[1];return amount?`Quantité insuffisante : ${amount} disponible(s).`:`Stock insuffisant pour terminer cette opération.`}],
  [/duplicate|unique|already exists|déjà utilisé|existe déjà/i,()=>`Cette information est déjà utilisée.`],
  [/not found|introuvable/i,()=>`La donnée demandée est introuvable.`],
];
function technicalMessage(error:unknown){return error instanceof Error?error.message:typeof error==='string'?error:error&&typeof error==='object'&&'message'in error&&typeof error.message==='string'?error.message:''}
const rawTechnical=/\b(?:uncaught|typeerror|syntaxerror|referenceerror|invalid key|stack trace|schema cache|postgres|postgrest|sqlstate|error|failed|cannot|could not|undefined|promise)\b|\brelation\s+\S+\s+does not exist|\bfunction\s+\S+\s+.*schema/i;
export function userErrorMessage(error:unknown,fallback='Le serveur est momentanément indisponible. Réessayez.'){const technical=technicalMessage(error).trim();for(const[pattern,message]of rules){const match=technical.match(pattern);if(match)return message(technical,match)}return !technical||rawTechnical.test(technical)?fallback:technical}
export const readableError=userErrorMessage;
