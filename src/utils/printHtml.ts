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

  const popup = window.open('', '_blank', 'popup=yes,width=860,height=920');
  if (!popup) throw new Error('Autorisez les fenêtres contextuelles pour imprimer ce reçu.');

  popup.document.open();
  popup.document.write(html.replace('<head>', `<head><title>${title}</title>`));
  popup.document.close();
  await waitForReceiptAssets(popup);
  popup.focus();
  popup.print();
}

/** Produit un PDF natif puis ouvre le partage. Sur le web, ouvre l'impression avec « Enregistrer au format PDF ». */
export async function shareHtmlAsPdf(html:string,title='Document StockMaster'){
  if(Platform.OS==='web'){
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
