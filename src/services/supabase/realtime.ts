let channelSequence = 0;

/**
 * Supabase Realtime reuses an existing channel when its topic is identical.
 * React Strict Mode can remount an effect before the previous asynchronous
 * cleanup finishes, so every subscription instance needs its own topic.
 */
export function createRealtimeTopic(scope: string) {
  channelSequence += 1;
  return `${scope}:${Date.now().toString(36)}:${channelSequence}:${Math.random().toString(36).slice(2, 8)}`;
}
