import { Injectable } from '@angular/core';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { Invoice, computeDisplayStatus, getDisplayTotal, getTaxMode, hasIndiaTotals, summarizeTaxBySlab } from '../models/invoice';
import { Company } from '../models/company';
import { InvoiceTemplate } from '../models/invoice-template';
import { numberToWords } from '../utils/number-to-words';
import { buildUpiDeepLink } from '../utils/upi';

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

    // UPI QR renders whenever (a) the tenant has a UPI ID configured and
    // (b) the invoice currency is INR (UPI is INR-only). Status (paid /
    // pending / overdue) is NOT a gate — the customer often wants to scan an
    // already-paid invoice for reference or to record the transaction.
    const qrDataUrl = await maybeGenerateUpiQr(invoice, company, template);
    const docDefinition = buildInvoiceDocDefinition(invoice, company, template, qrDataUrl);
    (pdfMake as any).createPdf(docDefinition).download(`${invoice.number}.pdf`);
  }

  /** Exposed for tests — returns the pdfmake document definition without rendering. */
  async buildDocDefinition(
    invoice: Invoice,
    company: Pick<Company, 'name' | 'defaultCurrency'>,
    template: InvoiceTemplate | null = null
  ): Promise<TDocumentDefinitions> {
    const qrDataUrl = await maybeGenerateUpiQr(invoice, company, template);
    return buildInvoiceDocDefinition(invoice, company, template, qrDataUrl);
  }
}

/**
 * Returns a base64 PNG data URL of the UPI QR when all gating conditions hold,
 * otherwise null. Dynamically imports the `qrcode` library so its ~30 KB only
 * lands in the chunk fetched when a PDF is actually downloaded.
 */
async function maybeGenerateUpiQr(
  invoice: Invoice,
  company: Pick<Company, 'name' | 'defaultCurrency'>,
  template: InvoiceTemplate | null
): Promise<string | null> {
  const upiId = (template?.footer?.upiId ?? '').trim();
  if (!upiId) return null;
  if (invoice.currency !== 'INR') return null;

  const QRCode = (await import('qrcode')).default ?? (await import('qrcode'));
  const payload = buildUpiDeepLink({
    vpa: upiId,
    payeeName: company.name,
    amount: getDisplayTotal(invoice),
    transactionNote: invoice.number
  });
  return (QRCode as any).toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1 });
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
  qrDataUrl: string | null,
  copyLabel?: string
): any[] {
  const displayStatus = computeDisplayStatus(invoice).toUpperCase();
  const issue = invoice.issueDate.toDate().toISOString().slice(0, 10);
  const due = invoice.dueDate.toDate().toISOString().slice(0, 10);
  const india = hasIndiaTotals(invoice);
  const hasHsnColumn = invoice.lineItems.some((li) => !!li.hsnSac);

  // ----- Line items table widths (tuned for a ~268pt-wide copy column) -----
  const itemWise = getTaxMode(invoice) === 'item';
  const tableWidths: any[] = hasHsnColumn ? ['*', 40, 22, 50, 60] : ['*', 22, 50, 60];
  if (itemWise) tableWidths.splice(tableWidths.length - 1, 0, 28); // GST % column before Line total

  // ----- Line items table header + body -----
  const headerRow: any[] = [{ text: 'Description', bold: true }];
  if (hasHsnColumn) headerRow.push({ text: 'HSN/SAC', bold: true });
  headerRow.push({ text: 'Qty', bold: true }, { text: 'Unit', bold: true });
  if (itemWise) headerRow.push({ text: 'GST', bold: true });
  headerRow.push({ text: 'Line total', bold: true });

  const rows: any[][] = invoice.lineItems.map((li) => {
    const row: any[] = [li.description ?? ''];
    if (hasHsnColumn) row.push(li.hsnSac ?? '');
    row.push(
      { text: String(li.quantity), alignment: 'right' },
      { text: fmtCurrency(li.unitPrice, invoice.currency), alignment: 'right' }
    );
    if (itemWise) row.push({ text: `${li.gstPercent ?? 0}%`, alignment: 'right' });
    row.push(
      { text: fmtCurrency(li.lineTotal, invoice.currency), alignment: 'right' }
    );
    return row;
  });

  // ----- Totals block -----
  const totalsBody: any[][] = [];
  totalsBody.push(['Subtotal', { text: fmtCurrency(invoice.subtotal, invoice.currency), alignment: 'right' }]);

  if (india) {
    const half = (invoice.gstPercent ?? 0) / 2;
    if (itemWise) {
      // One CGST + SGST pair per slab actually used on the bill.
      for (const row of summarizeTaxBySlab(invoice.lineItems)) {
        totalsBody.push([
          `CGST ${row.gstPercent / 2}% on ${fmtCurrency(row.taxable, invoice.currency)}`,
          { text: fmtCurrency(row.cgst, invoice.currency), alignment: 'right' }
        ]);
        totalsBody.push([
          `SGST ${row.gstPercent / 2}% on ${fmtCurrency(row.taxable, invoice.currency)}`,
          { text: fmtCurrency(row.sgst, invoice.currency), alignment: 'right' }
        ]);
      }
    } else if ((invoice.gstPercent ?? 0) > 0) {
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

  // ----- Top section: company info (left) + optional UPI QR (top-right) -----
  // When a QR is rendered, the company info and the QR live inside a single
  // `columns` element so pdfmake constrains the text to the left column and
  // they can never overlap. When no QR is rendered, we keep the original
  // top-to-bottom layout — preserves byte-identity for tenants without UPI.
  const headerBand = renderHeaderBand(template);
  const companyStack: any[] = [{ text: company.name, style: 'companyHeader' }];
  if (headerBand) companyStack.push(headerBand);
  companyStack.push({ text: `Invoice ${invoice.number}`, style: 'invoiceHeader' });

  if (qrDataUrl) {
    content.push({
      columns: [
        { stack: companyStack, width: '*' },
        { stack: renderQrCard(qrDataUrl), width: 80, alignment: 'right' }
      ],
      columnGap: 8
    });
  } else {
    for (const node of companyStack) content.push(node);
  }

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

  // ----- Footer band: Bank Details (left) | Signature (right) -----
  // Renders only when a template document exists. The signature column always
  // shows when there's a template, with default "Authorized Signatory" text.
  // (The UPI QR moved to the top-right corner — see the top section above.)
  const footerBand = renderFooterBand(template, company);
  if (footerBand) content.push(footerBand);

  // ----- Disclaimer (small italic) — NEW. Only when template has it. -----
  const disclaimer = renderDisclaimer(template);
  if (disclaimer) content.push(disclaimer);

  content.push({ text: `Generated ${new Date().toISOString()}`, style: 'footer' });

  return content;
}

// ----- New band renderers -----

/**
 * Header band: structured contact + address + tax-ID info below the company
 * name. Returns `null` when the template is null or when all header fields are
 * empty.
 *
 * Visual structure (each line a separate row, all left-aligned):
 *
 *   <Company name>                                  ← already drawn above this band
 *   <Address line 1>
 *   <Address line 2>
 *   Phone: 9876543210 | Email: foo@bar.com | Web: example.com
 *   GSTIN: 29ABCDE1234F1Z5 | PAN: ABCDE1234F | CIN: ...
 *
 * Address lines come from the single `header.address` string split on newlines.
 * Contact + tax-ID rows show only the populated fields and drop their
 * separators when a field is absent. URLs have their `http(s)://` prefix
 * stripped for visual cleanliness — the underlying value in Firestore is
 * preserved unchanged.
 */
function renderHeaderBand(template: InvoiceTemplate | null): any | null {
  if (!template) return null;
  const h = template.header ?? {};
  const lines: any[] = [];

  // Address block — each non-empty line is its own row, small spacing.
  if (h.address) {
    for (const addr of h.address.split(/\r?\n/)) {
      const trimmed = addr.trim();
      if (trimmed) lines.push({ text: trimmed, fontSize: 8, color: '#444' });
    }
  }

  // Contact info row: Phone | Email | Web, labeled.
  const contactPieces: Array<{ label: string; value: string }> = [];
  if (h.phone) contactPieces.push({ label: 'Phone', value: h.phone });
  if (h.email) contactPieces.push({ label: 'Email', value: h.email });
  if (h.website) {
    const stripped = h.website.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    contactPieces.push({ label: 'Web', value: stripped });
  }
  if (contactPieces.length) {
    lines.push({
      text: joinLabeledPieces(contactPieces),
      fontSize: 8,
      color: '#444',
      margin: [0, lines.length ? 2 : 0, 0, 0]
    });
  }

  // Tax-ID row: GSTIN | PAN | CIN — same labelled pattern, slightly bolder.
  const idPieces: Array<{ label: string; value: string }> = [];
  if (h.gstin) idPieces.push({ label: 'GSTIN', value: h.gstin });
  if (h.pan) idPieces.push({ label: 'PAN', value: h.pan });
  if (h.cin) idPieces.push({ label: 'CIN', value: h.cin });
  if (idPieces.length) {
    lines.push({
      text: joinLabeledPieces(idPieces, /* valueBold */ true),
      fontSize: 8,
      margin: [0, lines.length ? 2 : 0, 0, 0]
    });
  }

  if (lines.length === 0) return null;
  return { stack: lines, margin: [0, 2, 0, 6] };
}

/** Builds a pdfmake `text` array of the form `Label: value  |  Label: value`. */
function joinLabeledPieces(
  pieces: Array<{ label: string; value: string }>,
  valueBold = false
): any[] {
  const out: any[] = [];
  pieces.forEach((p, i) => {
    if (i > 0) out.push({ text: '  |  ', color: '#bbb' });
    out.push({ text: `${p.label}: `, bold: true });
    out.push({ text: p.value, bold: valueBold });
  });
  return out;
}

/**
 * Footer band: Bank Details on the left, Signature block on the right.
 * Renders only when a profile template exists (i.e. the tenant has touched
 * the Profile page). Bank Details column collapses to an empty cell when no
 * bank fields are set; the Signature column always renders with at least
 * `For <Company Name>` + `Authorized Signatory`.
 */
function renderFooterBand(
  template: InvoiceTemplate | null,
  company: Pick<Company, 'name' | 'defaultCurrency'>
): any | null {
  if (!template) return null;
  const f = template.footer ?? {};
  const s = template.signature ?? {};

  const bankLines: any[] = [];
  if (f.bankAccountName) bankLines.push({ text: `Account Name: ${f.bankAccountName}` });
  if (f.bankName) bankLines.push({ text: `Bank: ${f.bankName}` });
  if (f.accountNumber) bankLines.push({ text: `Account No.: ${f.accountNumber}` });
  if (f.ifsc) bankLines.push({ text: `IFSC: ${f.ifsc}` });
  if (f.branch) bankLines.push({ text: `Branch: ${f.branch}` });
  if (f.upiId) bankLines.push({ text: `UPI: ${f.upiId}` });

  const leftCol: any = bankLines.length === 0
    ? { text: '' }
    : { stack: [{ text: 'Bank Details', bold: true, margin: [0, 0, 0, 2] }, ...bankLines] };

  // Signature column — always present.
  const title = (s.signatoryTitle ?? '').trim() || 'Authorized Signatory';
  const sigLines: any[] = [{ text: `For ${company.name}`, bold: true, alignment: 'right' }];
  // Reserved vertical space for a wet signature / stamp.
  sigLines.push({ text: '\n\n\n', fontSize: 7 });
  if (s.signatoryName) sigLines.push({ text: s.signatoryName, alignment: 'right' });
  sigLines.push({ text: title, italics: true, alignment: 'right' });
  const rightCol: any = { stack: sigLines };

  return {
    margin: [0, 10, 0, 0],
    fontSize: 7,
    columns: [leftCol, rightCol],
    columnGap: 8
  };
}

/**
 * UPI QR card rendered in the top-right corner of each invoice copy.
 * Returns an array of pdfmake nodes suitable for use as a `stack`. Caller is
 * responsible for placing it inside a column with a fixed width so it does
 * NOT overlap with the company info on its left.
 */
function renderQrCard(qrDataUrl: string): any[] {
  return [
    { text: 'Scan to pay', fontSize: 7, bold: true, alignment: 'right', margin: [0, 0, 0, 2] },
    { image: qrDataUrl, width: 72, height: 72, alignment: 'right' },
    { text: 'UPI', fontSize: 6, color: '#888', alignment: 'right', margin: [0, 1, 0, 0] }
  ];
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
  template: InvoiceTemplate | null,
  qrDataUrl: string | null
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
          { stack: buildInvoiceCopy(invoice, company, template, qrDataUrl, 'ORIGINAL FOR RECIPIENT'), width: '*' },
          { stack: buildInvoiceCopy(invoice, company, template, qrDataUrl, 'DUPLICATE FOR SUPPLIER'), width: '*' }
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
