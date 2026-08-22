if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const escapeHtml = (value) => String(value).replace(/[&<>]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
  })[character]);

  const getBootStatus = () => {
    let status = document.getElementById('web-boot-status');
    if (status) return status;
    status = document.createElement('div');
    status.id = 'web-boot-status';
    status.setAttribute('role', 'status');
    status.style.cssText = 'position:fixed;inset:0;z-index:999999;display:grid;place-items:center;padding:24px;background:#f7faf8;color:#084b50;font-family:system-ui,sans-serif';
    status.innerHTML = '<div style="text-align:center"><div style="width:42px;height:42px;margin:0 auto 18px;border:4px solid #cde8e2;border-top-color:#084b50;border-radius:50%;animation:stockmaster-spin .8s linear infinite"></div><strong style="font-size:18px">Ouverture de StockMaster…</strong></div>';
    document.body.appendChild(status);
    return status;
  };

  const showBootError = (title, value) => {
    const detail = value && value.stack ? value.stack : value && value.message ? value.message : value;
    const status = getBootStatus();
    status.style.background = '#fff8f6';
    status.style.color = '#5c231d';
    status.innerHTML = `<div style="width:min(720px,100%);padding:24px;border:1px solid #f1c8c3;border-radius:16px;background:white;box-shadow:0 20px 60px rgba(0,0,0,.12)"><strong style="display:block;margin-bottom:12px;font-size:20px">${escapeHtml(title)}</strong><pre style="margin:0;white-space:pre-wrap;word-break:break-word;font:13px/1.55 ui-monospace,monospace">${escapeHtml(detail || 'Erreur inconnue')}</pre><p style="margin:16px 0 0;font-size:13px">Envoyez une capture de ce message pour identifier immédiatement la panne.</p></div>`;
  };

  const style = document.createElement('style');
  style.textContent = '@keyframes stockmaster-spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(style);
  getBootStatus();
  window.addEventListener('error', (event) => showBootError('StockMaster ne peut pas démarrer', event.error || event.message));
  window.addEventListener('unhandledrejection', (event) => showBootError('Erreur pendant le démarrage de StockMaster', event.reason));
  window.setTimeout(() => {
    const root = document.getElementById('root');
    if (!root || root.childElementCount === 0) showBootError('Chargement interrompu', 'Aucun écran React n’a été monté après 15 secondes.');
  }, 15_000);
}

require('expo-router/entry');
