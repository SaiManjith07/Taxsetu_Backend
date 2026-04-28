/**
 * Normalized invoice schema – single shape for all input sources.
 * Watcher converts photo OCR, CSV, voice, and manual entry into this shape
 * so Calculator, Filer, and All Invoices see one consistent structure.
 *
 * Canonical fields (all documents have these):
 * - invoice_number, invoice_date, supplier_name, supplier_gstin
 * - taxable_amount, gst_rate, gst_amount, total_amount
 * - source, metadata
 */

export const NORMALIZED_INVOICE_FIELDS = [
  'invoice_number',
  'invoice_date',
  'supplier_name',
  'supplier_gstin',
  'taxable_amount',
  'gst_rate',
  'gst_amount',
  'total_amount',
  'source',
  'metadata',
]

/**
 * Defaults for missing optional fields so every doc has the same keys.
 */
const DEFAULTS = {
  invoice_number: '',
  invoice_date: null,
  supplier_name: '',
  supplier_gstin: '',
  taxable_amount: 0,
  gst_rate: 0,
  gst_amount: 0,
  total_amount: 0,
  source: '',
  metadata: {},
}

/**
 * Ensure a plain object has all normalized fields with numbers/strings where needed.
 * @param {Object} raw - Object that may have mixed field names from any source
 * @returns {Object} Same object with all NORMALIZED_INVOICE_FIELDS present
 */
export function ensureNormalizedShape(raw) {
  const d = { ...DEFAULTS, ...raw }
  return {
    invoice_number: String(d.invoice_number ?? '').trim() || DEFAULTS.invoice_number,
    invoice_date: d.invoice_date ?? DEFAULTS.invoice_date,
    supplier_name: String(d.supplier_name ?? '').trim() || DEFAULTS.supplier_name,
    supplier_gstin: String(d.supplier_gstin ?? '').trim() || DEFAULTS.supplier_gstin,
    taxable_amount: Number(d.taxable_amount) || 0,
    gst_rate: Number(d.gst_rate) || 0,
    gst_amount: Number(d.gst_amount) || 0,
    total_amount: Number(d.total_amount) || 0,
    source: d.source || DEFAULTS.source,
    metadata: typeof d.metadata === 'object' && d.metadata !== null ? d.metadata : {},
  }
}
