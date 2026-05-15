import { Injectable } from '@angular/core';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { Invoice, computeDisplayStatus, getDisplayTotal, hasIndiaTotals } from '../models/invoice';
import { Company } from '../models/company';
import { numberToWords } from '../utils/number-to-words';

@Injectable({ providedIn: 'root' })
export class PdfService {
  /** Generate and trigger download of `<invoice.number>.pdf`. */
  async generateInvoicePdf(invoice: Invoice, company: Pick<Company, 'name' | 'defaultCurrency'>): Promise<void> {
    // Dynamic import keeps pdfmake out of the initial bundle.
    const pdfMake = (await import('pdfmake/build/pdfmake')).default ?? (await import('pdfmake/build/pdfmake'));
    const pdfFonts = (await import('pdfmake/build/vfs_fonts')).default ?? (await import('pdfmake/build/vfs_fonts'));
    (pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs ?? (pdfFonts as any).vfs ?? (pdfMake as any).vfs;

    const docDefinition = buildInvoiceDocDefinition(invoice, company);
    (pdfMake as any).createPdf(docDefinition).download(`${invoice.number}.pdf`);
  }

  /** Exposed for tests — returns the pdfmake document definition without rendering. */
  buildDocDefinition(invoice: Invoice, company: Pick<Company, 'name' | 'defaultCurrency'>): TDocumentDefinitions {
    return buildInvoiceDocDefinition(invoice, company);
  }
}

function fmtCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    // Some currencies aren't supported by every runtime — fall back to plain digits.
    return `${value.toFixed(2)} ${currency}`;
  }
}

function buildInvoiceDocDefinition(invoice: Invoice, company: Pick<Company, 'name' | 'defaultCurrency'>): TDocumentDefinitions {
  const displayStatus = computeDisplayStatus(invoice).toUpperCase();
  const issue = invoice.issueDate.toDate().toISOString().slice(0, 10);
  const due = invoice.dueDate.toDate().toISOString().slice(0, 10);
  const india = hasIndiaTotals(invoice);
  const hasHsnColumn = invoice.lineItems.some((li) => !!li.hsnSac);

  // ----- Bill-to block -----
  const billTo: any[] = [{ text: 'Bill to:', bold: true, margin: [0, 8, 0, 2] as [number, number, number, number] }];
  billTo.push({ text: invoice.customer.name, bold: true });
  if (invoice.customer.shopName) billTo.push(invoice.customer.shopName);
  if (invoice.customer.fullAddress) billTo.push(invoice.customer.fullAddress);
  else if (invoice.customer.address) billTo.push(invoice.customer.address);
  if (invoice.customer.gstNumber) billTo.push(`GSTIN: ${invoice.customer.gstNumber}`);
  if (invoice.customer.phoneNumber) billTo.push(`Phone: ${invoice.customer.phoneNumber}`);
  if (invoice.customer.email) billTo.push(invoice.customer.email);

  // ----- Line items table -----
  const headerRow: any[] = [{ text: 'Description', bold: true }];
  if (hasHsnColumn) headerRow.push({ text: 'HSN/SAC', bold: true });
  headerRow.push({ text: 'Qty', bold: true }, { text: 'Unit', bold: true }, { text: 'Line total', bold: true });

  const rows: any[][] = invoice.lineItems.map((li) => {
    const row: any[] = [li.description ?? ''];
    if (hasHsnColumn) row.push(li.hsnSac ?? '');
    row.push(
      { text: String(li.quantity), alignment: 'right' },
      { text: fmtCurrency(li.unitPrice, invoice.currency), alignment: 'right' },
      { text: fmtCurrency(li.lineTotal, invoice.currency), alignment: 'right' }
    );
    return row;
  });

  const tableWidths: any[] = hasHsnColumn ? ['*', 60, 40, 70, 80] : ['*', 40, 70, 80];

  // ----- Totals block -----
  const totalsBody: any[][] = [];
  totalsBody.push(['Subtotal', { text: fmtCurrency(invoice.subtotal, invoice.currency), alignment: 'right' }]);

  if (india) {
    const half = (invoice.gstPercent ?? 0) / 2;
    if ((invoice.gstPercent ?? 0) > 0) {
      totalsBody.push([
        `CGST (${half}%)`,
        { text: fmtCurrency(invoice.cgstAmount ?? 0, invoice.currency), alignment: 'right' }
      ]);
      totalsBody.push([
        `SGST (${half}%)`,
        { text: fmtCurrency(invoice.sgstAmount ?? 0, invoice.currency), alignment: 'right' }
      ]);
    }
    if ((invoice.otherCharges ?? 0) !== 0) {
      totalsBody.push([
        'Other Charges',
        { text: fmtCurrency(invoice.otherCharges ?? 0, invoice.currency), alignment: 'right' }
      ]);
    }
    if ((invoice.roundOff ?? 0) !== 0) {
      totalsBody.push([
        'Round Off',
        { text: fmtCurrency(invoice.roundOff ?? 0, invoice.currency), alignment: 'right' }
      ]);
    }
    totalsBody.push([
      { text: 'Grand Total', bold: true },
      { text: fmtCurrency(getDisplayTotal(invoice), invoice.currency), alignment: 'right', bold: true }
    ]);
  } else {
    totalsBody.push([
      { text: 'Total', bold: true },
      { text: fmtCurrency(invoice.total, invoice.currency), alignment: 'right', bold: true }
    ]);
  }

  // ----- Amount-in-words footer -----
  const amountInWords = india
    ? numberToWords(getDisplayTotal(invoice), invoice.currency)
    : '';

  const content: any[] = [
    { text: company.name, style: 'companyHeader' },
    { text: `Invoice ${invoice.number}`, style: 'invoiceHeader' },
    {
      columns: [
        billTo,
        [
          { text: `Invoice date: ${issue}`, alignment: 'right' },
          { text: `Due date: ${due}`, alignment: 'right' },
          { text: `Status: ${displayStatus}`, alignment: 'right', bold: true, margin: [0, 4, 0, 0] }
        ]
      ]
    },
    {
      margin: [0, 16, 0, 0],
      table: { headerRows: 1, widths: tableWidths, body: [headerRow, ...rows] }
    },
    {
      margin: [0, 10, 0, 0],
      columns: [
        { text: '' },
        {
          width: 240,
          table: { widths: ['*', 'auto'], body: totalsBody },
          layout: 'lightHorizontalLines'
        }
      ]
    }
  ];

  if (amountInWords) {
    content.push({
      margin: [0, 8, 0, 0],
      text: [{ text: 'Amount in words: ', bold: true }, amountInWords],
      italics: true
    });
  }

  if (invoice.notes) {
    content.push({ text: invoice.notes, margin: [0, 16, 0, 0], italics: true });
  }
  content.push({ text: `Generated ${new Date().toISOString()}`, style: 'footer' });

  return {
    content,
    styles: {
      companyHeader: { fontSize: 16, bold: true },
      invoiceHeader: { fontSize: 14, margin: [0, 8, 0, 0] },
      footer: { fontSize: 8, color: '#888', margin: [0, 24, 0, 0] }
    },
    defaultStyle: { fontSize: 10 }
  };
}
