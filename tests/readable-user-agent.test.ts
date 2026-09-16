import { describe, expect, it } from 'vitest';
import { readableUserAgent } from '@/utils/readableUserAgent';

// "Appareils connectés" (account-web) compte les appareils distincts par
// device_label : un texte générique identique pour tout le monde (l'ancien
// comportement) rendait ce compteur et le journal de sécurité inutiles.
describe('readableUserAgent', () => {
  it('reconnaît Chrome sur Windows', () => {
    expect(readableUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')).toBe('Chrome sur Windows');
  });

  it('reconnaît Safari sur macOS (Chrome absent du user-agent Safari)', () => {
    expect(readableUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15')).toBe('Safari sur macOS');
  });

  it('distingue Chrome sur Android de Safari sur iOS', () => {
    expect(readableUserAgent('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36')).toBe('Chrome sur Android');
    expect(readableUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1')).toBe('Safari sur iOS');
  });

  it('reconnaît Edge et Firefox', () => {
    expect(readableUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0')).toBe('Edge sur Windows');
    expect(readableUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0')).toBe('Firefox sur Windows');
  });

  it('retombe sur le texte brut tronqué si rien n’est reconnu', () => {
    const unknown = 'SomeExoticClient/1.0 (a device we have never seen before)';
    expect(readableUserAgent(unknown)).toBe(unknown);
  });
});
