/** Bound read requests so an unavailable service cannot keep a screen loading forever. */
export async function withRequestTimeout<T>(operation: (signal: AbortSignal) => PromiseLike<T>, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Le serveur met trop de temps à répondre. Réessayez.'));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
