const rules: [RegExp, string][] = [
  [/failed to fetch|network request failed|load failed/i, 'Connexion internet indisponible. Vérifiez votre réseau puis réessayez.'],
  [/jwt|session|refresh token/i, 'Votre session a expiré. Reconnectez-vous.'],
  [/permission|row-level security|access|accès refusé|unauthorized|forbidden/i, 'Vous n’avez pas l’autorisation d’effectuer cette action.'],
  [/stock insuffisant/i, 'Stock insuffisant pour terminer cette opération.'],
  [/duplicate|unique|already exists|déjà utilisé|existe déjà/i, 'Cette information est déjà utilisée.'],
  [/not found|introuvable/i, 'La donnée demandée est introuvable.'],
];

export function userErrorMessage(error: unknown, fallback = 'Le serveur est momentanément indisponible. Réessayez.'): string {
  const technical = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return rules.find(([pattern]) => pattern.test(technical))?.[1] ?? (technical || fallback);
}
