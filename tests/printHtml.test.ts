import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('expo-print', () => ({ printAsync: vi.fn(), printToFileAsync: vi.fn() }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: vi.fn(), shareAsync: vi.fn() }));
vi.mock('@/services/observability/logger', () => ({ logger: { error: vi.fn() } }));

// SM-12 (audit externe) : l'export PDF/impression sur web ne produisait
// visiblement rien quand Chrome bloque la pop-up ouverte par window.open —
// reproduit ici en simulant exactement ce que fait un vrai bloqueur
// (window.open renvoie null), sans dépendre d'un compte de test ni d'un
// vrai navigateur.
describe('printHtmlDocument sur web', () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it('rejette avec un message clair au lieu d’échouer silencieusement quand la pop-up est bloquée (null)', async () => {
    (globalThis as { window?: unknown }).window = { open: () => null };
    const { printHtmlDocument } = await import('@/utils/printHtml');
    await expect(printHtmlDocument('<html><head></head><body>x</body></html>', 'Test')).rejects.toThrow(/fenêtres contextuelles/i);
  });

  it('rejette avec le même message clair quand la pop-up est un objet déjà fermé (autre comportement de blocage possible)', async () => {
    (globalThis as { window?: unknown }).window = { open: () => ({ closed: true, document: {} }) };
    const { printHtmlDocument } = await import('@/utils/printHtml');
    await expect(printHtmlDocument('<html><head></head><body>x</body></html>', 'Test')).rejects.toThrow(/fenêtres contextuelles/i);
  });

  it('rejette avec le même message clair si l’accès au document de la pop-up échoue (fermeture juste après ouverture)', async () => {
    (globalThis as { window?: unknown }).window = {
      open: () => ({ closed: false, document: { open: () => { throw new Error('cross-origin ou fenêtre fermée'); } } }),
    };
    const { printHtmlDocument } = await import('@/utils/printHtml');
    await expect(printHtmlDocument('<html><head></head><body>x</body></html>', 'Test')).rejects.toThrow(/fenêtres contextuelles/i);
  });

  it('écrit le document et lance l’impression quand la pop-up est autorisée', async () => {
    const printSpy = vi.fn();
    const focusSpy = vi.fn();
    const writeSpy = vi.fn();
    const popup = {
      document: {
        images: [] as HTMLImageElement[],
        open: vi.fn(),
        write: writeSpy,
        close: vi.fn(),
      },
      focus: focusSpy,
      print: printSpy,
    };
    (globalThis as { window?: unknown }).window = { open: () => popup };
    const { printHtmlDocument } = await import('@/utils/printHtml');
    await printHtmlDocument('<html><head></head><body>x</body></html>', 'Reçu');
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('<title>Reçu</title>'));
    expect(focusSpy).toHaveBeenCalled();
    expect(printSpy).toHaveBeenCalled();
  });
});
