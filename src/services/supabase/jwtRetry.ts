const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function isJwtIssuedInFuture(error: unknown) {
  const message = typeof error === 'object' && error !== null && 'message' in error
    ? String(error.message)
    : String(error ?? '');
  return /jwt issued at future|issued in the future/i.test(message);
}

export async function retryJwtClockSkew<T extends { error: unknown }>(
  operation: () => PromiseLike<T>,
  attempts = 5,
): Promise<T> {
  let result = await operation();
  for (let attempt = 1; result.error && isJwtIssuedInFuture(result.error) && attempt < attempts; attempt += 1) {
    await wait(Math.min(8_000, 1_000 * 2 ** (attempt - 1)));
    result = await operation();
  }
  return result;
}
