export function validateReplacementPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128
    || !/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    throw new Error('Utilisez entre 10 et 128 caractères, avec majuscule, minuscule, chiffre et caractère spécial.');
  }
  return value;
}
