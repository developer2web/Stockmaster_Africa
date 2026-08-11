import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { Sale } from '@/types/database';
import { formatQuantity } from '@/utils/number';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[character]!);

function receiptHtml(sale: Sale, companyName: string, money: (value:number)=>string) {
  const rows=(sale.sale_items??[]).map(item=>`<tr><td>${escape(item.variant?`${item.product?.name} - ${item.variant.name}`:item.product?.name??'Produit')}</td><td>${formatQuantity(item.quantity)}</td><td>${escape(money(Number(item.sale_price)))}</td><td>${escape(money(Number(item.line_total)))}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#17212b;margin:32px}header{text-align:center;border-bottom:2px solid #087F5B;padding-bottom:16px}h1{color:#087F5B;margin:0}.meta{color:#667085;margin:6px 0}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{text-align:left;padding:10px 6px;border-bottom:1px solid #ddd}th:last-child,td:last-child{text-align:right}.totals{margin-left:auto;width:300px}.line{display:flex;justify-content:space-between;padding:5px}.grand{font-size:20px;font-weight:bold;color:#087F5B;border-top:2px solid #087F5B;margin-top:5px;padding-top:10px}footer{text-align:center;color:#667085;margin-top:36px;font-size:12px}</style></head><body><header><h1>${escape(companyName)}</h1><div class="meta">${escape(sale.store?.name??'Boutique')}</div><div class="meta">Reçu ${escape(sale.reference??sale.id)}</div><div class="meta">${escape(new Date(sale.created_at).toLocaleString('fr-CA'))}</div></header><table><thead><tr><th>Produit</th><th>Qté</th><th>Prix</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div class="line"><span>Sous-total</span><b>${escape(money(Number(sale.subtotal)))}</b></div><div class="line"><span>Payé</span><b>${escape(money(Number(sale.amount_paid)))}</b></div>${Number(sale.amount_due)>0?`<div class="line"><span>Reste dû</span><b>${escape(money(Number(sale.amount_due)))}</b></div>`:''}<div class="line grand"><span>Total</span><span>${escape(money(Number(sale.total)))}</span></div></div><footer>Paiement : ${escape(sale.payment_method??'Non précisé')}<br>Merci pour votre confiance.</footer></body></html>`;
}

export async function printReceipt(sale: Sale, companyName: string, money: (value:number)=>string) {
  await Print.printAsync({ html: receiptHtml(sale,companyName,money) });
}

export async function shareReceipt(sale: Sale, companyName: string, money: (value:number)=>string) {
  const file=await Print.printToFileAsync({ html: receiptHtml(sale,companyName,money) });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Le partage de fichiers n’est pas disponible sur cet appareil.');
  await Sharing.shareAsync(file.uri,{mimeType:'application/pdf',dialogTitle:`Reçu ${sale.reference??''}`});
}
