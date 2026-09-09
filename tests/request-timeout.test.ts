import { afterEach, describe, expect, it, vi } from 'vitest';
import { withRequestTimeout } from '@/services/supabase/requestTimeout';

afterEach(() => vi.useRealTimers());
describe('bounded server reads', () => {
  it('aborts a stalled read and releases the caller', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const request = withRequestTimeout(current => { signal = current; return new Promise(() => {}); });
    const assertion = expect(request).rejects.toThrow('trop de temps');
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('clears the deadline after success or immediate failure', async () => {
    vi.useFakeTimers();
    expect(await withRequestTimeout(() => Promise.resolve('received'))).toBe('received');
    await expect(withRequestTimeout(() => Promise.reject(new Error('Permission denied')))).rejects.toThrow('Permission denied');
    expect(vi.getTimerCount()).toBe(0);
  });
});
