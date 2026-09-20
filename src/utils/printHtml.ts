import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { logger } from '@/services/observability/logger';

function waitForReceiptAssets(popup: Window) {
  const images = Array.from(popup.document.images);
  if (!images.length || images.every((image) => image.complete)) return Promise.resolve();
  const loaded = Promise.all(images.map((image) => new Promise<void>((resolve) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => resolve(), { once: true });
  })));
  return Promise.race([loaded.then(() => undefined), new Promise<void>((resolve) => setTimeout(resolve, 1800))]);
}

/** Imprime uniquement le document fourni, jamais l'écran StockMaster courant. */
export async function printHtmlDocument(html: string, title = 'Document StockMaster') {
  if (Platform.OS !== 'web') {
    try {
      await Print.printAsync({ html });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/cancel/i.test(message)) return;
      throw new Error('Impossible d’imprimer le document. Vérifiez l’imprimante ou utilisez le partage PDF, puis réessayez.');
    }
    return;
  }

  const popupBlockedMessage = 'Autorisez les fenêtres contextuelles pour imprimer ce document, puis réessayez.';
  // SM-12 (audit externe) : selon le navigateur, une pop-up bloquée ne
  // renvoie pas toujours null — parfois un objet Window déjà fermé ou
  // inaccessible, dont chaque accès ci-dessous lève une erreur technique
  // différente. Les deux cas doivent aboutir au même message clair côté
  // utilisateur plutôt qu'à un échec silencieux ou un message incompréhensible.
  const popup = window.open('', '_blank', 'popup=yes,width=860,height=920');
  if (!popup || popup.closed) throw new Error(popupBlockedMessage);

  try {
    popup.document.open();
    popup.document.write(html.replace('<head>', `<head><title>${title}</title>`));
    popup.document.close();
    await waitForReceiptAssets(popup);
    popup.focus();
    popup.print();
  } catch {
    throw new Error(popupBlockedMessage);
  }
}

/**
 * Produit un PDF natif puis ouvre le partage (e-mail, WhatsApp…) via la
 * feuille de partage du système. Sur le web, expo-print ne sait pas générer
 * de PDF (natif uniquement) — on utilise donc l'API Web Share du navigateur,
 * qui ouvre la même feuille de partage (e-mail, WhatsApp…) avec un résumé en
 * texte du document. Sans support Web Share (vieux navigateur, HTTP non
 * sécurisé), on retombe sur l'impression telle quelle.
 */
export async function shareHtmlAsPdf(html:string,title='Document StockMaster',shareText=title){
  if(Platform.OS==='web'){
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: shareText });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        await logger.error('receipt_web_share_failed', error, { title });
      }
    }
    await printHtmlDocument(html,title);
    return;
  }
  try{
    const file=await Print.printToFileAsync({html});
    if(!file?.uri)throw new Error('PDF file URI missing');
    if(!(await Sharing.isAvailableAsync()))throw new Error('Sharing is not available');
    await Sharing.shareAsync(file.uri,{mimeType:'application/pdf',dialogTitle:title,UTI:'com.adobe.pdf'});
  }catch(error){
    await logger.error('receipt_pdf_share_failed',error,{title});
    const message=error instanceof Error?error.message:'';
    if(/cancel/i.test(message))return;
    throw new Error('Impossible de préparer le PDF. Réessayez ou utilisez Imprimer.');
  }
}
