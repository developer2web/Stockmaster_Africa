type Rule=[RegExp,(technical:string,match:RegExpMatchArray)=>string];
const rules:Rule[]=[
  [/failed to fetch|network request failed|load failed/i,()=>`Connexion internet indisponible. Vérifiez votre réseau puis réessayez.`],
  [/jwt|session|refresh token/i,()=>`Votre session a expiré. Reconnectez-vous.`],
  [/permission|row-level security|access|accès refusé|unauthorized|forbidden/i,()=>`Vous n’avez pas l’autorisation d’effectuer cette action.`],
  [/stock insuffisant|insufficient stock|quantit[eé] insuffisante/i,(technical)=>{const amount=technical.match(/(?:disponible|available)\D*(\d+(?:[.,]\d+)?)/i)?.[1];return amount?`Quantité insuffisante : ${amount} disponible(s).`:`Stock insuffisant pour terminer cette opération.`}],
  [/duplicate|unique|already exists|déjà utilisé|existe déjà/i,()=>`Cette information est déjà utilisée.`],
  [/not found|introuvable/i,()=>`La donnée demandée est introuvable.`],
];
function technicalMessage(error:unknown){return error instanceof Error?error.message:typeof error==='string'?error:error&&typeof error==='object'&&'message'in error&&typeof error.message==='string'?error.message:''}
export function userErrorMessage(error:unknown,fallback='Le serveur est momentanément indisponible. Réessayez.'){const technical=technicalMessage(error);for(const[pattern,message]of rules){const match=technical.match(pattern);if(match)return message(technical,match)}return technical||fallback}
export const readableError=userErrorMessage;
