import { Injectable } from '@angular/core';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { Invoice, computeDisplayStatus, getDisplayTotal, hasIndiaTotals } from '../models/invoice';
import { Company } from '../models/company';
import { numberToWords } from '../utils/number-to-words';

// Flip to true to print `ORIGINAL FOR RECIPIENT` / `DUPLICATE FOR SUPPLIER`
// badges (standard Indian GST convention) at the top-right of each copy.
const SHOW_COPY_LABELS = false;

// Portrait A4, measured in pdfmake points (1pt = 1/72").
const PAGE_MARGIN_X = 24;
const PAGE_MARGIN_Y = 18;
// Space reserved between the two copies — the vertical separator line sits in
// the middle of this gap (drawn via pageBackground, not via a content column,
// so it doesn't consume vertical content space).
const COLUMN_GAP = 20;

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
    return `${value.toFixed(2)} ${currency}`;
  }
}

/**
 * Returns the pdfmake content array for ONE copy of the invoice. The caller
 * places two of these side-by-side inside a top-level `columns` element with
 * a vertical dashed separator between them — see `buildInvoiceDocDefinition`.
 */
function buildInvoiceCopy(
  invoice: Invoice,
  company: Pick<Company, 'name' | 'defaultCurrency'>,
  copyLabel?: string
): any[] {
  const displayStatus = computeDisplayStatus(invoice).toUpperCase();
  const issue = invoice.issueDate.toDate().toISOString().slice(0, 10);
  const due = invoice.dueDate.toDate().toISOString().slice(0, 10);
  const india = hasIndiaTotals(invoice);
  const hasHsnColumn = invoice.lineItems.some((li) => !!li.hsnSac);

  // ----- Line items table widths (tuned for a ~268pt-wide copy column) -----
  const tableWidths: any[] = hasHsnColumn ? ['*', 40, 22, 50, 60] : ['*', 22, 50, 60];

  // ----- Line items table header + body -----
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
  const amountInWords = india ? numberToWords(getDisplayTotal(invoice), invoice.currency) : '';

  const content: any[] = [];

  // Optional copy label badge at top-right.
  if (SHOW_COPY_LABELS && copyLabel) {
    content.push({
      text: copyLabel,
      alignment: 'right',
      fontSize: 7,
      color: '#666',
      margin: [0, 0, 0, 2]
    });
  }

  content.push({ text: company.name, style: 'companyHeader' });
  content.push({ text: `Invoice ${invoice.number}`, style: 'invoiceHeader' });

  // Bill-to + dates as a single vertical stack (each copy is too narrow to
  // split into two sub-columns — see design Decision 4).
  content.push({ text: 'Bill to:', bold: true, margin: [0, 4, 0, 1] });
  content.push({ text: invoice.customer.name, bold: true });
  if (invoice.customer.shopName) content.push({ text: invoice.customer.shopName });
  if (invoice.customer.fullAddress) content.push({ text: invoice.customer.fullAddress });
  else if (invoice.customer.address) content.push({ text: invoice.customer.address });
  if (invoice.customer.gstNumber) content.push({ text: `GSTIN: ${invoice.customer.gstNumber}` });
  if (invoice.customer.phoneNumber) content.push({ text: `Phone: ${invoice.customer.phoneNumber}` });
  if (invoice.customer.email) content.push({ text: invoice.customer.email });

  content.push({ text: `Invoice date: ${issue}`, margin: [0, 4, 0, 0] });
  content.push({ text: `Due date: ${due}` });
  content.push({ text: `Status: ${displayStatus}`, alignment: 'right', bold: true, margin: [0, 2, 0, 0] });

  content.push({
    margin: [0, 6, 0, 0],
    table: { headerRows: 1, widths: tableWidths, body: [headerRow, ...rows] }
  });
  content.push({
    margin: [0, 4, 0, 0],
    columns: [
      { text: '' },
      {
        width: 200,
        table: { widths: ['*', 'auto'], body: totalsBody },
        layout: 'lightHorizontalLines'
      }
    ]
  });

  if (amountInWords) {
    content.push({
      margin: [0, 4, 0, 0],
      text: [{ text: 'Amount in words: ', bold: true }, amountInWords],
      italics: true
    });
  }

  if (invoice.notes) {
    content.push({ text: invoice.notes, margin: [0, 6, 0, 0], italics: true });
  }
  content.push({ text: `Generated ${new Date().toISOString()}`, style: 'footer' });

  return content;
}

function buildInvoiceDocDefinition(invoice: Invoice, company: Pick<Company, 'name' | 'defaultCurrency'>): TDocumentDefinitions {
  return {
    pageOrientation: 'landscape',
    pageSize: 'A4',
    pageMargins: [PAGE_MARGIN_X, PAGE_MARGIN_Y, PAGE_MARGIN_X, PAGE_MARGIN_Y],
    // Vertical dashed cut line drawn on the page background, NOT in the content
    // flow. Drawing it as a content element (with a tall canvas) forces pdfmake
    // to allocate ~806pt of vertical space for it, which overflows the page.
    // pageBackground sits behind content and is not part of the flow.
    background: (currentPage, pageSize) => ({
      canvas: [
        {
          type: 'line',
          x1: pageSize.width / 2,
          y1: PAGE_MARGIN_Y,
          x2: pageSize.width / 2,
          y2: pageSize.height - PAGE_MARGIN_Y,
          lineWidth: 0.5,
          lineColor: '#888',
          dash: { length: 4, space: 3 }
        }
      ]
    }),
    content: [
      {
        columns: [
          { stack: buildInvoiceCopy(invoice, company, 'ORIGINAL FOR RECIPIENT'), width: '*' },
          { stack: buildInvoiceCopy(invoice, company, 'DUPLICATE FOR SUPPLIER'), width: '*' }
        ],
        columnGap: COLUMN_GAP
      }
    ],
    styles: {
      companyHeader: { fontSize: 13, bold: true },
      invoiceHeader: { fontSize: 11, margin: [0, 4, 0, 0] },
      footer: { fontSize: 7, color: '#888', margin: [0, 4, 0, 0] }
    },
    defaultStyle: { fontSize: 8 }
  };
}
