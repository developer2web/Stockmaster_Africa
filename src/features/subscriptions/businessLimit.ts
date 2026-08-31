export function requiresRetainedBusinessChoice(activeBusinessCount: number, targetBusinessLimit: number) {
  const safeCount = Math.max(0, Math.trunc(activeBusinessCount));
  const safeLimit = Math.max(1, Math.trunc(targetBusinessLimit));
  return safeCount > safeLimit;
}
