import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import type { BusinessReport } from '@/types/database';
import type { FinancialDetails } from './api';

type ExportContext = { report: BusinessReport; companyName: string; currencyCode: string; periodLabel: string; cashBalance: number; details: FinancialDetails; preparedBy:string; scopeLabel:string };
const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

function reportHtml({ report, companyName, currencyCode, periodLabel, cashBalance, details, preparedBy, scopeLabel }: ExportContext) {
  const money = (value: number) => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: currencyCode, currencyDisplay: 'code' }).format(value);
  const shopValue = report.stockValue + cashBalance;
  const metric = (label: string, value: string, accent = '#102A24') => `<div class="metric"><span>${escape(label)}</span><strong style="color:${accent}">${escape(value)}</strong></div>`;
  const rows = report.topProducts.map((row, index) => `<tr><td>${index + 1}</td><td>${escape(row.name)}</td><td>${Number(row.quantity ?? 0).toLocaleString('fr-FR')}</td><td>${money(Number(row.revenue ?? 0))}</td><td>${money(Number(row.gross_profit ?? 0))}</td></tr>`).join('');
  const salesRows=details.sales.slice(0,100).map(row=>`<tr><td>${escape(row.reference??'Vente')}</td><td>${escape(new Date(row.created_at).toLocaleDateString('fr-CA'))}</td><td>${escape(row.store?.name??'Boutique')}</td><td>${money(Number(row.total))}</td><td>${money(Number(row.gross_profit))}</td></tr>`).join('');
  const expenseRows=details.expenses.slice(0,100).map(row=>`<tr><td>${escape(row.label)}</td><td>${escape(row.expense_date)}</td><td>${escape(row.store?.name??'Générale')}</td><td>${money(Number(row.amount))}</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>
    @page{margin:28px}*{box-sizing:border-box}body{font-family:Helvetica,Arial,sans-serif;color:#102A24;margin:0}
    header{background:#084B50;color:white;padding:24px;border-radius:16px;margin-bottom:20px}h1{margin:0 0 6px;font-size:26px}header p{margin:0;color:#D7EFF0}
    .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}.metric{border:1px solid #D5E2DD;border-radius:12px;padding:13px;background:#F7FAF9}
    .metric span{display:block;color:#53665F;font-size:11px;margin-bottom:6px}.metric strong{font-size:17px}.formula{background:#D7F5E9;padding:14px;border-radius:12px;margin:16px 0;font-weight:bold}
    h2{font-size:17px;margin:22px 0 10px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#102A24;color:white;text-align:left;padding:9px}td{padding:8px;border-bottom:1px solid #E5EFEB}
    footer{margin-top:24px;padding-top:10px;border-top:1px solid #D5E2DD;color:#53665F;font-size:9px;text-align:center}
  </style></head><body><header><h1>Rapport financier personnalisé</h1><p>${escape(companyName)} - ${escape(periodLabel)}</p><p>${escape(scopeLabel)}</p><p>Préparé par : ${escape(preparedBy)}</p></header>
  <div class="metrics">${metric('Revenus', money(report.revenue), '#1971C2')}${metric('Coût des marchandises', money(report.costOfGoods))}${metric('Bénéfice brut', money(report.grossProfit), '#084B50')}${metric('Dépenses', money(report.expenses), '#BA1A1A')}${metric('Bénéfice net', money(report.netProfit), report.netProfit >= 0 ? '#084B50' : '#BA1A1A')}${metric('Valeur du stock', money(report.stockValue), '#E67700')}${metric('Solde de caisse', money(cashBalance), '#7048E8')}${metric('Valeur de la boutique', money(shopValue), '#084B50')}${metric('Ventes / unités', `${report.saleCount} / ${report.quantitySold}`)}</div>
  <div class="formula">Bénéfice net = bénéfice brut - dépenses = ${money(report.grossProfit)} - ${money(report.expenses)} = ${money(report.netProfit)}</div>
  <h2>Détail des ventes</h2><table><thead><tr><th>Référence</th><th>Date</th><th>Boutique</th><th>Total</th><th>Bénéfice</th></tr></thead><tbody>${salesRows||'<tr><td colspan="5">Aucune vente</td></tr>'}</tbody></table>
  <h2>Détail des dépenses</h2><table><thead><tr><th>Motif</th><th>Date</th><th>Boutique</th><th>Montant</th></tr></thead><tbody>${expenseRows||'<tr><td colspan="4">Aucune dépense</td></tr>'}</tbody></table>
  <h2>Produits les plus rentables</h2><table><thead><tr><th>#</th><th>Produit</th><th>Quantité</th><th>Revenus</th><th>Bénéfice brut</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Aucune donnée</td></tr>'}</tbody></table>
  <footer>Généré pour ${escape(companyName)} par ${escape(preparedBy)} le ${new Date().toLocaleString('fr-CA')}</footer></body></html>`;
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

const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csvRow = (values: unknown[]) => values.map(csvCell).join(';');

export async function exportFinancialCsv({ report, companyName, currencyCode, periodLabel, cashBalance, details, preparedBy, scopeLabel }: ExportContext) {
  const rows: string[] = [
    csvRow(['RAPPORT FINANCIER STOCKMASTER']),
    csvRow(['Entreprise', companyName]),
    csvRow(['Période', periodLabel]),
    csvRow(['Préparé par', preparedBy]),
    csvRow(['Périmètre', scopeLabel]),
    csvRow(['Devise', currencyCode]),
    '',
    csvRow(['INDICATEUR', 'MONTANT']),
    csvRow(['Revenus', report.revenue]),
    csvRow(['Coût des marchandises', report.costOfGoods]),
    csvRow(['Bénéfice brut', report.grossProfit]),
    csvRow(['Dépenses', report.expenses]),
    csvRow(['Bénéfice net', report.netProfit]),
    csvRow(['Valeur du stock', report.stockValue]),
    csvRow(['Solde de caisse', cashBalance]),
    '',
    csvRow(['VENTES']),
    csvRow(['Référence', 'Date', 'Boutique', 'Paiement', 'Total', 'Bénéfice']),
    ...details.sales.map((row) => csvRow([row.reference ?? 'Vente', new Date(row.created_at).toLocaleString('fr-CA'), row.store?.name ?? '', row.payment_method ?? '', row.total, row.gross_profit])),
    '',
    csvRow(['DÉPENSES']),
    csvRow(['Motif', 'Date', 'Boutique', 'Montant']),
    ...details.expenses.map((row) => csvRow([row.label, row.expense_date, row.store?.name ?? '', row.amount])),
  ];
  const content = `\uFEFF${rows.join('\r\n')}`;
  const filename = `rapport-financier-${report.startDate}-${report.endDate}.csv`;
  if (Platform.OS === 'web') {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
    return;
  }
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(content);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Exporter le rapport CSV' });
}
