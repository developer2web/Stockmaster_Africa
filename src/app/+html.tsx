import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';
import { autofillStyles } from '@/constants/formStyles';

const bootDiagnostics = `
(function () {
  function text(value) {
    if (value && value.stack) return String(value.stack);
    if (value && value.message) return String(value.message);
    return String(value || 'Erreur inconnue');
  }
  function show(title, detail) {
    var box = document.getElementById('web-boot-status');
    if (!box) return;
    box.style.display = 'grid';
    box.innerHTML = '<div style="max-width:720px;padding:24px;border:1px solid #f1c8c3;border-radius:14px;background:#fff;color:#5c231d;box-shadow:0 20px 60px rgba(0,0,0,.14)"><strong style="display:block;margin-bottom:10px;font:800 20px system-ui">' + title + '</strong><pre style="margin:0;white-space:pre-wrap;word-break:break-word;font:13px/1.55 ui-monospace,monospace">' + detail.replace(/[&<>]/g, function (character) { return ({'&':'&amp;','<':'&lt;','>':'&gt;'})[character]; }) + '</pre><p style="margin:14px 0 0;font:13px/1.5 system-ui">Rechargez la page. Si le problème continue, transmettez ce message à l’assistance StockMaster.</p></div>';
  }
  window.addEventListener('error', function (event) {
    show('StockMaster ne peut pas démarrer', text(event.error || event.message));
  });
  window.addEventListener('unhandledrejection', function (event) {
    show('Erreur pendant le démarrage de StockMaster', text(event.reason));
  });
  window.setTimeout(function () {
    var root = document.getElementById('root');
    if (root && root.childElementCount === 0) show('Chargement de StockMaster interrompu', 'Aucun écran React n’a été monté après 15 secondes.');
  }, 15000);
})();`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#084B50" />
        <title>StockMaster</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: autofillStyles }} />
      </head>
      <body>
        <div id="web-boot-status" style={{ display: 'none', position: 'fixed', zIndex: 999999, inset: 0, padding: 20, placeItems: 'center', overflow: 'auto', background: '#f7faf8' }} />
        <script dangerouslySetInnerHTML={{ __html: bootDiagnostics }} />
        {children}
      </body>
    </html>
  );
}
