import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import * as XLSX from 'xlsx';
import type { BusinessReport } from '@/types/database';
import type { FinancialDetails } from './api';

type ExportContext = { report: BusinessReport; companyName: string; currencyCode: string; periodLabel: string; cashBalance: number; details: FinancialDetails };
const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

function reportHtml({ report, companyName, currencyCode, periodLabel, cashBalance, details }: ExportContext) {
  const money = (value: number) => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: currencyCode, currencyDisplay: 'code' }).format(value);
  const shopValue = report.stockValue + cashBalance;
  const metric = (label: string, value: string, accent = '#102A24') => `<div class="metric"><span>${escape(label)}</span><strong style="color:${accent}">${escape(value)}</strong></div>`;
  const rows = report.topProducts.map((row, index) => `<tr><td>${index + 1}</td><td>${escape(row.name)}</td><td>${Number(row.quantity ?? 0).toLocaleString('fr-FR')}</td><td>${money(Number(row.revenue ?? 0))}</td><td>${money(Number(row.gross_profit ?? 0))}</td></tr>`).join('');
  const salesRows=details.sales.slice(0,100).map(row=>`<tr><td>${escape(row.reference??'Vente')}</td><td>${escape(new Date(row.created_at).toLocaleDateString('fr-CA'))}</td><td>${escape(row.store?.name??'Boutique')}</td><td>${money(Number(row.total))}</td><td>${money(Number(row.gross_profit))}</td></tr>`).join('');
  const expenseRows=details.expenses.slice(0,100).map(row=>`<tr><td>${escape(row.label)}</td><td>${escape(row.expense_date)}</td><td>${escape(row.store?.name??'Générale')}</td><td>${money(Number(row.amount))}</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>
    @page{margin:28px}*{box-sizing:border-box}body{font-family:Helvetica,Arial,sans-serif;color:#102A24;margin:0}
    header{background:#087F5B;color:white;padding:24px;border-radius:16px;margin-bottom:20px}h1{margin:0 0 6px;font-size:26px}header p{margin:0;color:#D7F5E9}
    .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}.metric{border:1px solid #D5E2DD;border-radius:12px;padding:13px;background:#F7FAF9}
    .metric span{display:block;color:#53665F;font-size:11px;margin-bottom:6px}.metric strong{font-size:17px}.formula{background:#D7F5E9;padding:14px;border-radius:12px;margin:16px 0;font-weight:bold}
    h2{font-size:17px;margin:22px 0 10px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#102A24;color:white;text-align:left;padding:9px}td{padding:8px;border-bottom:1px solid #E5EFEB}
    footer{margin-top:24px;padding-top:10px;border-top:1px solid #D5E2DD;color:#53665F;font-size:9px;text-align:center}
  </style></head><body><header><h1>Rapport financier StockMaster</h1><p>${escape(companyName)} - ${escape(periodLabel)}</p></header>
  <div class="metrics">${metric('Revenus', money(report.revenue), '#1971C2')}${metric('Coût des marchandises', money(report.costOfGoods))}${metric('Bénéfice brut', money(report.grossProfit), '#087F5B')}${metric('Dépenses', money(report.expenses), '#BA1A1A')}${metric('Bénéfice net', money(report.netProfit), report.netProfit >= 0 ? '#087F5B' : '#BA1A1A')}${metric('Valeur du stock', money(report.stockValue), '#E67700')}${metric('Solde de caisse', money(cashBalance), '#7048E8')}${metric('Valeur de la boutique', money(shopValue), '#087F5B')}${metric('Ventes / unités', `${report.saleCount} / ${report.quantitySold}`)}</div>
  <div class="formula">Bénéfice net = bénéfice brut - dépenses = ${money(report.grossProfit)} - ${money(report.expenses)} = ${money(report.netProfit)}</div>
  <h2>Détail des ventes</h2><table><thead><tr><th>Référence</th><th>Date</th><th>Boutique</th><th>Total</th><th>Bénéfice</th></tr></thead><tbody>${salesRows||'<tr><td colspan="5">Aucune vente</td></tr>'}</tbody></table>
  <h2>Détail des dépenses</h2><table><thead><tr><th>Motif</th><th>Date</th><th>Boutique</th><th>Montant</th></tr></thead><tbody>${expenseRows||'<tr><td colspan="4">Aucune dépense</td></tr>'}</tbody></table>
  <h2>Produits les plus rentables</h2><table><thead><tr><th>#</th><th>Produit</th><th>Quantité</th><th>Revenus</th><th>Bénéfice brut</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Aucune donnée</td></tr>'}</tbody></table>
  <footer>Généré par StockMaster le ${new Date().toLocaleString('fr-CA')}</footer></body></html>`;
}

export async function exportFinancialPdf(context: ExportContext) {
  const html = reportHtml(context);
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Exporter le rapport PDF' });
}

export async function exportFinancialExcel({ report, companyName, currencyCode, periodLabel, cashBalance, details }: ExportContext) {
  const workbook = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet([
    ['RAPPORT FINANCIER STOCKMASTER'],
    ['Entreprise', companyName],
    ['Période', periodLabel],
    ['Généré le', new Date()],
    [],
    ['Indicateur', 'Montant'],
    ['Revenus', report.revenue],
    ['Coût des marchandises', report.costOfGoods],
    ['Bénéfice brut', report.grossProfit],
    ['Dépenses', report.expenses],
    ['Bénéfice net', { f: 'B9-B10' }],
    ['Valeur du stock', report.stockValue],
    ['Solde de caisse', cashBalance],
    ['Valeur de la boutique', { f: 'B12+B13' }],
    ['Nombre de ventes', report.saleCount],
    ['Quantité vendue', report.quantitySold],
  ]);
  summary['!cols'] = [{ wch: 28 }, { wch: 22 }];
  for (let row = 7; row <= 14; row += 1) if (summary[`B${row}`]) summary[`B${row}`].z = `#,##0.00 "${currencyCode}"`;
  XLSX.utils.book_append_sheet(workbook, summary, 'Résumé');
  const sales=XLSX.utils.json_to_sheet(details.sales.map(row=>({Référence:row.reference??'Vente',Date:new Date(row.created_at),Boutique:row.store?.name??'',Paiement:row.payment_method??'',Total:Number(row.total),Bénéfice:Number(row.gross_profit)})));
  sales['!cols']=[{wch:24},{wch:18},{wch:24},{wch:16},{wch:18},{wch:18}];XLSX.utils.book_append_sheet(workbook,sales,'Ventes');
  const expenses=XLSX.utils.json_to_sheet(details.expenses.map(row=>({Motif:row.label,Date:row.expense_date,Boutique:row.store?.name??'',Montant:Number(row.amount)})));
  expenses['!cols']=[{wch:34},{wch:14},{wch:24},{wch:18}];XLSX.utils.book_append_sheet(workbook,expenses,'Dépenses');
  const cash=XLSX.utils.json_to_sheet(details.cash.map(row=>({Désignation:row.designation,Date:new Date(row.created_at),Boutique:row.store?.name??'',Type:row.transaction_type==='deposit'?'Entrée':'Sortie',Source:row.source,Montant:Number(row.amount)})));
  cash['!cols']=[{wch:34},{wch:18},{wch:24},{wch:12},{wch:14},{wch:18}];XLSX.utils.book_append_sheet(workbook,cash,'Caisse');

  const products = XLSX.utils.json_to_sheet(report.topProducts.map((row, index) => ({ Rang: index + 1, Produit: row.name, Quantité: Number(row.quantity ?? 0), Revenus: Number(row.revenue ?? 0), 'Bénéfice brut': Number(row.gross_profit ?? 0) })));
  products['!cols'] = [{ wch: 8 }, { wch: 32 }, { wch: 12 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(workbook, products, 'Produits');
  const stores = XLSX.utils.json_to_sheet(report.stores.map((row) => ({ Boutique: row.name, Revenus: Number(row.revenue ?? 0), Ventes: Number(row.sales ?? row.count ?? 0) })));
  stores['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(workbook, stores, 'Boutiques');
  const employees = XLSX.utils.json_to_sheet(report.employees.map((row) => ({ Employé: row.name, Revenus: Number(row.revenue ?? 0), Ventes: Number(row.sales ?? row.count ?? 0) })));
  employees['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(workbook, employees, 'Employés');

  const filename = `rapport-financier-${report.startDate}-${report.endDate}.xlsx`;
  if (Platform.OS === 'web') {
    XLSX.writeFile(workbook, filename);
    return;
  }
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(new Uint8Array(bytes));
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', UTI: 'org.openxmlformats.spreadsheetml.sheet', dialogTitle: 'Exporter le rapport Excel' });
}
