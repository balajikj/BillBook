import { Injectable } from '@angular/core';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { Invoice, computeDisplayStatus, getDisplayTotal, hasIndiaTotals } from '../models/invoice';
import { Company } from '../models/company';
import { InvoiceTemplate } from '../models/invoice-template';
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
  /**
   * Generate and trigger download of `<invoice.number>.pdf`. The `template`
   * argument carries the company's invoice profile (header/footer/signature/
   * disclaimer). Pass `null` (the default) to render the prior layout with no
   * new bands — used for tenants that have never saved a profile.
   */
  async generateInvoicePdf(
    invoice: Invoice,
    company: Pick<Company, 'name' | 'defaultCurrency'>,
    template: InvoiceTemplate | null = null
  ): Promise<void> {
    // Dynamic import keeps pdfmake out of the initial bundle.
    const pdfMake = (await import('pdfmake/build/pdfmake')).default ?? (await import('pdfmake/build/pdfmake'));
    const pdfFonts = (await import('pdfmake/build/vfs_fonts')).default ?? (await import('pdfmake/build/vfs_fonts'));
    (pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs ?? (pdfFonts as any).vfs ?? (pdfMake as any).vfs;

    const docDefinition = buildInvoiceDocDefinition(invoice, company, template);
    (pdfMake as any).createPdf(docDefinition).download(`${invoice.number}.pdf`);
  }

  /** Exposed for tests — returns the pdfmake document definition without rendering. */
  buildDocDefinition(
    invoice: Invoice,
    company: Pick<Company, 'name' | 'defaultCurrency'>,
    template: InvoiceTemplate | null = null
  ): TDocumentDefinitions {
    return buildInvoiceDocDefinition(invoice, company, template);
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
 *
 * When `template === null`, this function emits zero new bands — the output is
 * byte-identical (modulo the generated-at timestamp) to the prior layout.
 */
function buildInvoiceCopy(
  invoice: Invoice,
  company: Pick<Company, 'name' | 'defaultCurrency'>,
  template: InvoiceTemplate | null,
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

  // ----- Company name + header band (NEW) -----
  content.push({ text: company.name, style: 'companyHeader' });
  const headerBand = renderHeaderBand(template);
  if (headerBand) content.push(headerBand);

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

  // ----- Footer band (bank + T&C) — NEW. Only when template is present. -----
  const footerBand = renderFooterBand(template);
  if (footerBand) content.push(footerBand);

  // ----- Signature block (lower-right) — NEW. Only when template is present. -----
  const signatureBlock = renderSignatureBlock(template, company);
  if (signatureBlock) content.push(signatureBlock);

  // ----- Disclaimer (small italic) — NEW. Only when template has it. -----
  const disclaimer = renderDisclaimer(template);
  if (disclaimer) content.push(disclaimer);

  content.push({ text: `Generated ${new Date().toISOString()}`, style: 'footer' });

  return content;
}

// ----- New band renderers -----

/**
 * Header band: contact info + tax IDs below the company name. Returns `null`
 * when the template is null or when all header fields are empty.
 */
function renderHeaderBand(template: InvoiceTemplate | null): any | null {
  if (!template) return null;
  const h = template.header ?? {};
  const lines: any[] = [];

  if (h.phone) lines.push({ text: h.phone, fontSize: 8 });

  const contactPieces: string[] = [];
  if (h.email) contactPieces.push(h.email);
  if (h.website) contactPieces.push(h.website);
  if (contactPieces.length) lines.push({ text: contactPieces.join(' · '), fontSize: 8 });

  for (const addr of h.addressLines ?? []) {
    if (addr) lines.push({ text: addr, fontSize: 8 });
  }

  const idPieces: string[] = [];
  if (h.gstin) idPieces.push(`GSTIN: ${h.gstin}`);
  if (h.pan) idPieces.push(`PAN: ${h.pan}`);
  if (h.cin) idPieces.push(`CIN: ${h.cin}`);
  if (idPieces.length) lines.push({ text: idPieces.join(' · '), fontSize: 8, bold: true });

  if (lines.length === 0) return null;
  return { stack: lines, margin: [0, 1, 0, 2] };
}

/**
 * Footer band: Bank Details (left) + Terms & Conditions (right) in two columns.
 * Returns `null` when both columns would be empty.
 */
function renderFooterBand(template: InvoiceTemplate | null): any | null {
  if (!template) return null;
  const f = template.footer ?? {};
  const tnc = (template.termsAndConditions ?? '').trim();

  const bankLines: any[] = [];
  if (f.bankAccountName) bankLines.push({ text: `Account Name: ${f.bankAccountName}` });
  if (f.bankName) bankLines.push({ text: `Bank: ${f.bankName}` });
  if (f.accountNumber) bankLines.push({ text: `Account No.: ${f.accountNumber}` });
  if (f.ifsc) bankLines.push({ text: `IFSC: ${f.ifsc}` });
  if (f.branch) bankLines.push({ text: `Branch: ${f.branch}` });
  if (f.upiId) bankLines.push({ text: `UPI: ${f.upiId}` });

  if (bankLines.length === 0 && tnc === '') return null;

  const leftCol: any = bankLines.length === 0
    ? { text: '' }
    : { stack: [{ text: 'Bank Details', bold: true, margin: [0, 0, 0, 2] }, ...bankLines] };

  const rightCol: any = tnc === ''
    ? { text: '' }
    : { stack: [{ text: 'Terms & Conditions', bold: true, margin: [0, 0, 0, 2] }, { text: tnc, preserveLeadingSpaces: true }] };

  return {
    margin: [0, 8, 0, 0],
    fontSize: 7,
    columns: [leftCol, rightCol],
    columnGap: 8
  };
}

/**
 * Signature block: anchored to the right side of the copy. Always renders the
 * `For <Company Name>` line and the title (`Authorized Signatory` by default)
 * — but only when a profile document exists. Returns `null` when `template` is
 * null so empty-profile invoices render byte-identically to the prior layout.
 */
function renderSignatureBlock(
  template: InvoiceTemplate | null,
  company: Pick<Company, 'name' | 'defaultCurrency'>
): any | null {
  if (!template) return null;
  const s = template.signature ?? {};
  const title = (s.signatoryTitle ?? '').trim() || 'Authorized Signatory';
  const stackLines: any[] = [{ text: `For ${company.name}`, bold: true }];
  // ~36pt vertical gap reserved for a wet signature / stamp.
  stackLines.push({ text: '\n\n\n', fontSize: 8 });
  if (s.signatoryName) stackLines.push({ text: s.signatoryName });
  stackLines.push({ text: title, italics: true });

  return {
    margin: [0, 10, 0, 0],
    columns: [
      { text: '' },
      { width: 'auto', alignment: 'right', stack: stackLines, fontSize: 8 }
    ]
  };
}

/**
 * Disclaimer: small italic text spanning the full copy width. Returns `null`
 * when no disclaimer is configured.
 */
function renderDisclaimer(template: InvoiceTemplate | null): any | null {
  if (!template) return null;
  const d = (template.disclaimer ?? '').trim();
  if (!d) return null;
  return {
    text: d,
    italics: true,
    fontSize: 7,
    color: '#555',
    preserveLeadingSpaces: true,
    margin: [0, 8, 0, 0]
  };
}

function buildInvoiceDocDefinition(
  invoice: Invoice,
  company: Pick<Company, 'name' | 'defaultCurrency'>,
  template: InvoiceTemplate | null
): TDocumentDefinitions {
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
          { stack: buildInvoiceCopy(invoice, company, template, 'ORIGINAL FOR RECIPIENT'), width: '*' },
          { stack: buildInvoiceCopy(invoice, company, template, 'DUPLICATE FOR SUPPLIER'), width: '*' }
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
