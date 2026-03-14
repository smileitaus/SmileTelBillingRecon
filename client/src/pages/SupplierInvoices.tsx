/**
 * Supplier Invoices — Upload and import supplier invoices.
 * Supports:
 *   - Exetel (SmileIT): CSV files parsed client-side
 *   - Channel Haus: PDF files parsed server-side
 *   - Legion: PDF files parsed server-side
 *   - Tech-e: PDF files parsed server-side
 */
import { useState, useRef, useCallback } from "react";
import { SasBossMatchReview } from "@/components/SasBossMatchReview";
import {
  Upload, FileText, CheckCircle, AlertTriangle, X,
  ChevronDown, ChevronUp, RefreshCw, FileType, BookOpen,
} from "lucide-react";
import { ProviderBadge } from "@/components/ProviderBadge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import * as XLSX from "xlsx";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExetelRow {
  serviceNumber: string;
  idTag: string;
  category: string;
  description: string;
  quantity: number;
  unitPriceIncGst: number;
  totalIncGst: number;
  billStart: string;
  billEnd: string;
  chargeType: string;
  avcId: string;
}

interface ParsedExetelInvoice {
  type: "csv";
  supplier: "Exetel";
  invoiceNumber: string;
  rows: ExetelRow[];
  recurringRows: ExetelRow[];
  onceOffRows: ExetelRow[];
  subtotal: number;
}

interface ParsedPdfService {
  friendlyName: string;
  serviceId: string;
  serviceType: "Internet" | "Voice" | "Other";
  amountExGst: number;
  description: string;
  avcId?: string;
  address?: string;
}

interface ParsedPdfInvoice {
  type: "pdf";
  supplier: "ChannelHaus" | "Legion" | "Tech-e" | "VineDirect" | "Infinet" | "Blitznet" | "Exetel";
  invoiceNumber: string;
  invoiceDate: string;
  totalIncGst: number;
  services: ParsedPdfService[];
}

// ── SasBoss Workbook Types ────────────────────────────────────────────────────

interface SasBossPivotRow {
  enterprise_name: string;
  product_name: string;
  product_type: string;
  service_ref_id?: string;
  sum_ex_gst: number;
  sum_inc_gst: number;
}

interface SasBossCallUsageRow {
  enterprise_name: string;
  call_usage_ex_gst: number;
}

interface ParsedSasBossWorkbook {
  type: "xlsx";
  supplier: "SasBoss";
  workbookName: string;
  billingMonth: string; // e.g. '2026-03'
  invoiceReference: string;
  pivotRows: SasBossPivotRow[];
  callUsageRows: SasBossCallUsageRow[];
  totalExGst: number;
  totalCallUsageExGst: number;
  enterpriseCount: number;
}

type ParsedInvoice = ParsedExetelInvoice | ParsedPdfInvoice | ParsedSasBossWorkbook;

// ── Exetel CSV Parser ─────────────────────────────────────────────────────────

function parseExetelCsv(content: string): ParsedExetelInvoice {
  const lines = content.split("\n");
  let headerIdx = -1;
  let invoiceNumber = "";

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("Invoice #:")) {
      invoiceNumber = lines[i].split("Invoice #:")[1]?.trim() || "";
    }
    if (lines[i].includes("Item ID") && lines[i].includes("Reference No")) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) throw new Error("Could not find header row — is this an Exetel invoice?");

  const headers = lines[headerIdx].split(",").map((h) => h.trim());
  const rows: ExetelRow[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (
      line.startsWith("Subtotal") ||
      line.startsWith("Freight") ||
      line.startsWith("GST") ||
      line.startsWith("Total") ||
      line.startsWith("Payment") ||
      line.startsWith("Bank")
    )
      break;

    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());

    if (!fields[0] || !/^\d+$/.test(fields[0])) continue;

    const get = (key: string) => {
      const idx = headers.findIndex((h) => h === key || h === ` ${key}`);
      return idx >= 0 ? (fields[idx] || "").trim() : "";
    };

    const parsePrice = (s: string) => parseFloat(s.replace(/[$,]/g, "")) || 0;

    rows.push({
      serviceNumber: get("Service Number"),
      idTag: get("ID Tag"),
      category: get("Category"),
      description: get("Item Description"),
      quantity: parseFloat(get("Quantity")) || 1,
      unitPriceIncGst: parsePrice(get("Unit Price (inc-GST)")),
      totalIncGst: parsePrice(get("Total (inc-GST)")),
      billStart: get("Bill Start Date"),
      billEnd: get("Bill End Date"),
      chargeType: get("Charge Type"),
      avcId: (get("AVC Id") || get(" AVC Id") || "").replace(/^-$/, ""),
    });
  }

  const recurringRows = rows.filter(
    (r) => r.chargeType.toLowerCase().includes("recurring") && r.totalIncGst > 0
  );
  const onceOffRows = rows.filter(
    (r) => !r.chargeType.toLowerCase().includes("recurring") || r.totalIncGst < 0
  );
  const subtotal = rows.reduce((sum, r) => sum + r.totalIncGst, 0);

  return { type: "csv", supplier: "Exetel", invoiceNumber, rows, recurringRows, onceOffRows, subtotal };
}

// ── SasBoss XLSX Parser ───────────────────────────────────────────────────────

function normaliseName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseSasBossWorkbook(buffer: ArrayBuffer, filename: string): ParsedSasBossWorkbook {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetNames = wb.SheetNames;
  if (!sheetNames.includes('Pivot')) {
    throw new Error('This does not appear to be a SasBoss Dispatch workbook — no "Pivot" tab found.');
  }

  // ── Parse Pivot tab ──────────────────────────────────────────────────────────
  const pivotSheet = wb.Sheets['Pivot'];
  const pivotRaw: any[][] = XLSX.utils.sheet_to_json(pivotSheet, { header: 1, defval: null });

  // Find header row (row 1, 0-indexed)
  const headerRow = pivotRaw[1] as string[];
  // Columns: Enterprise Name | Product Name | Product Type | Service Ref Id | Item Description | Sum of Enterprise Id | Sum of Qty | Sum of Total (INC-GST) | Sum of Total (EX-GST)
  const colEnterprise = 0;
  const colProduct = 1;
  const colProductType = 2;
  const colServiceRef = 3;
  const colIncGst = 7;
  const colExGst = 8;

  const pivotRows: SasBossPivotRow[] = [];
  let lastEnterprise = '';

  for (let i = 2; i < pivotRaw.length; i++) {
    const row = pivotRaw[i];
    if (!row || row.every(c => c === null)) continue;

    const enterprise = row[colEnterprise] ? String(row[colEnterprise]).trim() : lastEnterprise;
    if (enterprise) lastEnterprise = enterprise;

    const product = row[colProduct] ? String(row[colProduct]).trim() : null;
    const productType = row[colProductType] ? String(row[colProductType]).trim() : null;

    // Skip subtotal/total rows
    if (!product || !productType) continue;
    if (product.toLowerCase().includes('total') || productType.toLowerCase().includes('total')) continue;
    if (enterprise.toLowerCase().includes('total') || enterprise.toLowerCase().includes('grand')) continue;

    const exGst = typeof row[colExGst] === 'number' ? row[colExGst] : parseFloat(String(row[colExGst] ?? '0')) || 0;
    const incGst = typeof row[colIncGst] === 'number' ? row[colIncGst] : parseFloat(String(row[colIncGst] ?? '0')) || 0;

    pivotRows.push({
      enterprise_name: enterprise,
      product_name: product,
      product_type: productType,
      service_ref_id: row[colServiceRef] ? String(row[colServiceRef]).trim() : undefined,
      sum_ex_gst: exGst,
      sum_inc_gst: incGst,
    });
  }

  // ── Parse Sheet1 (call usage) ─────────────────────────────────────────────────
  const sheet1 = wb.Sheets['Sheet1'];
  const sheet1Raw: any[] = XLSX.utils.sheet_to_json(sheet1, { defval: null });

  // Call usage rows: Product Name is null/empty
  const callUsageByEnterprise = new Map<string, number>();
  for (const row of sheet1Raw) {
    const productName = row['Product Name'];
    if (productName !== null && productName !== undefined && String(productName).trim() !== '') continue;
    const enterprise = row['Enterprise Name'] ? String(row['Enterprise Name']).trim() : null;
    if (!enterprise) continue;
    const cost = typeof row['Total (EX-GST)'] === 'number' ? row['Total (EX-GST)'] : parseFloat(String(row['Total (EX-GST)'] ?? '0')) || 0;
    callUsageByEnterprise.set(enterprise, (callUsageByEnterprise.get(enterprise) ?? 0) + cost);
  }

  const callUsageRows: SasBossCallUsageRow[] = Array.from(callUsageByEnterprise.entries())
    .filter(([, v]) => v > 0)
    .map(([enterprise_name, call_usage_ex_gst]) => ({ enterprise_name, call_usage_ex_gst }));

  // ── Derive billing month from filename ────────────────────────────────────────
  // e.g. "SasbossDispatchcharges(March).xlsx" → 2026-03
  const monthMap: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
  };
  const fnLower = filename.toLowerCase();
  let billingMonth = new Date().toISOString().slice(0, 7); // default to current month
  for (const [name, num] of Object.entries(monthMap)) {
    if (fnLower.includes(name)) {
      const year = new Date().getFullYear();
      billingMonth = `${year}-${num}`;
      break;
    }
  }

  const totalExGst = pivotRows.reduce((s, r) => s + r.sum_ex_gst, 0);
  const totalCallUsageExGst = callUsageRows.reduce((s, r) => s + r.call_usage_ex_gst, 0);
  const enterpriseCount = new Set(pivotRows.map(r => r.enterprise_name)).size;

  return {
    type: 'xlsx',
    supplier: 'SasBoss',
    workbookName: filename.replace(/\.xlsx$/i, ''),
    billingMonth,
    invoiceReference: '',
    pivotRows,
    callUsageRows,
    totalExGst,
    totalCallUsageExGst,
    enterpriseCount,
  };
}

function detectCsvSupplier(content: string): "Exetel" | null {
  if (content.includes("EXETEL") || content.includes("Exetel") || content.includes("SmileIT")) {
    return "Exetel";
  }
  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PriceCell({ value, incGst }: { value: number; incGst?: boolean }) {
  const display = incGst ? value : Math.round((value / 1.1) * 100) / 100;
  const label = incGst ? "inc-GST" : "ex-GST";
  return (
    <span className="font-mono text-xs">
      ${display.toFixed(2)}
      <span className="text-muted-foreground ml-1 text-[10px]">{label}</span>
    </span>
  );
}

function ExetelPreview({
  invoice,
  onConfirm,
  isImporting,
}: {
  invoice: ParsedExetelInvoice;
  onConfirm: () => void;
  isImporting: boolean;
}) {
  const [showOnceOff, setShowOnceOff] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 bg-card border border-border rounded-lg">
        <div className="flex items-center gap-3">
          <ProviderBadge provider="Exetel" size="md" />
          <div>
            <p className="text-sm font-semibold">{invoice.invoiceNumber}</p>
            <p className="text-xs text-muted-foreground">
              {invoice.rows.length} line items · {invoice.recurringRows.length} recurring ·{" "}
              {invoice.onceOffRows.length} once-off
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Invoice total (inc-GST)</p>
          <p className="text-lg font-bold font-mono">${invoice.subtotal.toFixed(2)}</p>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Recurring Services ({invoice.recurringRows.length})
        </h3>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Service #</th>
                <th className="text-left px-3 py-2 font-medium">Name / Tag</th>
                <th className="text-left px-3 py-2 font-medium">Category</th>
                <th className="text-left px-3 py-2 font-medium">Period</th>
                <th className="text-right px-3 py-2 font-medium">Cost (inc-GST)</th>
                <th className="text-right px-3 py-2 font-medium">Cost (ex-GST)</th>
              </tr>
            </thead>
            <tbody>
              {invoice.recurringRows.map((row, idx) => (
                <tr key={idx} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-muted-foreground">{row.serviceNumber}</td>
                  <td className="px-3 py-2 font-medium">{row.idTag || row.serviceNumber}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.category}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.billStart} – {row.billEnd}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">${row.totalIncGst.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">
                    <PriceCell value={row.totalIncGst} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {invoice.onceOffRows.length > 0 && (
        <div>
          <button
            onClick={() => setShowOnceOff((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 hover:text-foreground transition-colors"
          >
            {showOnceOff ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Once-off / Credits ({invoice.onceOffRows.length})
          </button>
          {showOnceOff && (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Service #</th>
                    <th className="text-left px-3 py-2 font-medium">Description</th>
                    <th className="text-left px-3 py-2 font-medium">Type</th>
                    <th className="text-right px-3 py-2 font-medium">Amount (inc-GST)</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.onceOffRows.map((row, idx) => (
                    <tr key={idx} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-muted-foreground">{row.serviceNumber}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-xs truncate">
                        {row.description}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            row.totalIncGst < 0
                              ? "bg-red-50 text-red-600"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {row.chargeType}
                        </span>
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-mono ${
                          row.totalIncGst < 0 ? "text-red-600" : ""
                        }`}
                      >
                        ${row.totalIncGst.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between p-4 bg-primary/5 border border-primary/20 rounded-lg">
        <div>
          <p className="text-sm font-medium">Ready to import</p>
          <p className="text-xs text-muted-foreground">
            This will create or update {invoice.recurringRows.length} Exetel services using{" "}
            <span className="font-mono">{invoice.invoiceNumber}</span> as the source of truth.
            Costs are stored ex-GST (÷1.1).
          </p>
        </div>
        <button
          onClick={onConfirm}
          disabled={isImporting}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isImporting ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle className="w-4 h-4" />
          )}
          {isImporting ? "Importing..." : "Confirm Import"}
        </button>
      </div>
    </div>
  );
}

function PdfInvoicePreview({
  invoice,
  onConfirm,
  isImporting,
}: {
  invoice: ParsedPdfInvoice;
  onConfirm: () => void;
  isImporting: boolean;
}) {
  const supplierLabel: Record<string, string> = {
    ChannelHaus: "Channel Haus",
    Legion: "Legion",
    "Tech-e": "Tech-e",
    VineDirect: "Vine Direct",
    Infinet: "Infinet",
    Blitznet: "Blitznet",
    Exetel: "Exetel",
  };

  const typeColor: Record<string, string> = {
    Internet: "bg-blue-50 text-blue-700 border-blue-200",
    Voice: "bg-purple-50 text-purple-700 border-purple-200",
    Other: "bg-muted text-muted-foreground border-border",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 bg-card border border-border rounded-lg">
        <div className="flex items-center gap-3">
          <ProviderBadge provider={invoice.supplier} size="md" />
          <div>
            <p className="text-sm font-semibold">{invoice.invoiceNumber}</p>
            <p className="text-xs text-muted-foreground">
              {supplierLabel[invoice.supplier]} · {invoice.invoiceDate} · {invoice.services.length} services
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Invoice total (inc-GST)</p>
          <p className="text-lg font-bold font-mono">${invoice.totalIncGst.toFixed(2)}</p>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Services ({invoice.services.length})
        </h3>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Name</th>
                <th className="text-left px-3 py-2 font-medium">Type</th>
                <th className="text-left px-3 py-2 font-medium">Description</th>
                <th className="text-right px-3 py-2 font-medium">Cost (ex-GST)</th>
              </tr>
            </thead>
            <tbody>
              {invoice.services.map((svc, idx) => (
                <tr key={idx} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{svc.friendlyName}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${typeColor[svc.serviceType]}`}>
                      {svc.serviceType}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground max-w-xs truncate">{svc.description}</td>
                  <td className="px-3 py-2 text-right font-mono">${svc.amountExGst.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between p-4 bg-primary/5 border border-primary/20 rounded-lg">
        <div>
          <p className="text-sm font-medium">Ready to import</p>
          <p className="text-xs text-muted-foreground">
            This will create or update {invoice.services.length} {supplierLabel[invoice.supplier]} services.
            Fuzzy matching will link services to existing customers where possible.
          </p>
        </div>
        <button
          onClick={onConfirm}
          disabled={isImporting}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isImporting ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle className="w-4 h-4" />
          )}
          {isImporting ? "Importing..." : "Confirm Import"}
        </button>
      </div>
    </div>
  );
}

// ── Import History ────────────────────────────────────────────────────────────

interface ImportResult {
  invoiceNumber: string;
  supplier: string;
  created: number;
  updated: number;
  skipped: number;
  timestamp: string;
}

// ── ABB Carbon API Sync ─────────────────────────────────────────────────────────────────────────────────

function AbbCarbonSyncSection() {
  const utils = trpc.useUtils();
  const [syncResult, setSyncResult] = useState<{ updated: number; skipped: number; errors: number } | null>(null);
  const syncMutation = trpc.billing.syncCarbonCosts.useMutation({
    onSuccess: (result) => {
      setSyncResult(result);
      toast.success(`Carbon sync complete: ${result.updated} services updated`);
      // Refresh all data that depends on service costs
      utils.billing.summary.invalidate();
      utils.billing.services.list.invalidate();
      utils.billing.margin.list.invalidate();
      utils.billing.margin.grouped.invalidate();
      utils.billing.customers.list.invalidate();
    },
    onError: (err) => toast.error('Carbon sync failed: ' + err.message),
  });

  return (
    <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ProviderBadge provider="ABB" size="md" />
          <div>
            <p className="text-sm font-semibold text-green-900">ABB / Carbon API Cost Sync</p>
            <p className="text-xs text-green-700">Overrides ABB service costs with live Carbon API data (source of truth)</p>
          </div>
        </div>
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-green-700 text-white rounded-md hover:bg-green-800 disabled:opacity-50 transition-colors"
        >
          {syncMutation.isPending ? (
            <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Syncing...</>
          ) : (
            <><RefreshCw className="w-3.5 h-3.5" /> Sync Carbon Costs Now</>
          )}
        </button>
      </div>
      {syncResult && (
        <div className="mt-3 flex items-center gap-4 text-xs text-green-800">
          <span className="font-semibold">{syncResult.updated} updated</span>
          <span>{syncResult.skipped} unchanged</span>
          {syncResult.errors > 0 && <span className="text-red-600">{syncResult.errors} errors</span>}
        </div>
      )}
    </div>
  );
}

// ── SasBoss Workbook Preview ──────────────────────────────────────────────────

function SasBossPreview({
  workbook,
  onConfirm,
  isImporting,
}: {
  workbook: ParsedSasBossWorkbook;
  onConfirm: () => void;
  isImporting: boolean;
}) {
  const [showPivot, setShowPivot] = useState(false);
  const [showCallUsage, setShowCallUsage] = useState(false);

  // Group pivot rows by enterprise for display
  const byEnterprise = new Map<string, SasBossPivotRow[]>();
  for (const row of workbook.pivotRows) {
    if (!byEnterprise.has(row.enterprise_name)) byEnterprise.set(row.enterprise_name, []);
    byEnterprise.get(row.enterprise_name)!.push(row);
  }

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="flex items-center justify-between p-4 bg-card border border-border rounded-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-purple-100 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-purple-700" />
          </div>
          <div>
            <p className="text-sm font-semibold">{workbook.workbookName}</p>
            <p className="text-xs text-muted-foreground">
              Billing month: {workbook.billingMonth} · {workbook.enterpriseCount} enterprises · {workbook.pivotRows.length} line items
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Services total (ex-GST)</p>
          <p className="text-lg font-bold font-mono">${workbook.totalExGst.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">+ ${workbook.totalCallUsageExGst.toFixed(2)} call usage</p>
        </div>
      </div>

      {/* Pivot rows preview */}
      <div className="border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setShowPivot(!showPivot)}
          className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 text-sm font-medium"
        >
          <span>Billable Line Items ({workbook.pivotRows.length})</span>
          {showPivot ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showPivot && (
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/20 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium">Enterprise</th>
                  <th className="text-left p-2 font-medium">Product</th>
                  <th className="text-left p-2 font-medium">Type</th>
                  <th className="text-right p-2 font-medium">Ex-GST</th>
                </tr>
              </thead>
              <tbody>
                {workbook.pivotRows.slice(0, 200).map((row, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="p-2 text-muted-foreground truncate max-w-[160px]">{row.enterprise_name}</td>
                    <td className="p-2 truncate max-w-[160px]">{row.product_name}</td>
                    <td className="p-2 text-muted-foreground">{row.product_type}</td>
                    <td className="p-2 text-right font-mono">${row.sum_ex_gst.toFixed(2)}</td>
                  </tr>
                ))}
                {workbook.pivotRows.length > 200 && (
                  <tr><td colSpan={4} className="p-2 text-center text-muted-foreground">… and {workbook.pivotRows.length - 200} more rows</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Call usage preview */}
      <div className="border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setShowCallUsage(!showCallUsage)}
          className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 text-sm font-medium"
        >
          <span>Call Usage Summaries — February ({workbook.callUsageRows.length} enterprises)</span>
          {showCallUsage ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showCallUsage && (
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/20 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium">Enterprise</th>
                  <th className="text-right p-2 font-medium">Call Usage (ex-GST)</th>
                </tr>
              </thead>
              <tbody>
                {workbook.callUsageRows.sort((a, b) => b.call_usage_ex_gst - a.call_usage_ex_gst).map((row, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="p-2 text-muted-foreground">{row.enterprise_name}</td>
                    <td className="p-2 text-right font-mono">${row.call_usage_ex_gst.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm */}
      <div className="flex items-center justify-between p-4 bg-purple-50 border border-purple-200 rounded-lg">
        <div>
          <p className="text-sm font-medium text-purple-900">Ready to import</p>
          <p className="text-xs text-purple-700 mt-0.5">
            Will match {workbook.enterpriseCount} enterprises to customers, update service costs, and record {workbook.callUsageRows.length} call usage summaries.
          </p>
        </div>
        <button
          onClick={onConfirm}
          disabled={isImporting}
          className="flex items-center gap-2 px-4 py-2 bg-purple-700 text-white text-sm font-medium rounded-md hover:bg-purple-800 disabled:opacity-50 transition-colors"
        >
          {isImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          {isImporting ? 'Importing…' : 'Confirm Import'}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────────────────────

export default function SupplierInvoices() {
  const utils = trpc.useUtils();
  const [dragOver, setDragOver] = useState(false);
  const [parsedInvoice, setParsedInvoice] = useState<ParsedInvoice | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importExetelMutation = trpc.billing.importExetelInvoice.useMutation({
    onSuccess: (result) => {
      setImportResults((prev) => [
        { invoiceNumber: result.invoiceNumber, supplier: "Exetel", created: result.created, updated: result.updated, skipped: result.skipped, timestamp: result.timestamp },
        ...prev,
      ]);
      setParsedInvoice(null);
      toast.success(`Import complete: ${result.created} created, ${result.updated} updated`);
      // Refresh all panels that depend on service costs
      utils.billing.summary.invalidate();
      utils.billing.services.list.invalidate();
      utils.billing.margin.list.invalidate();
      utils.billing.margin.grouped.invalidate();
      utils.billing.customers.list.invalidate();
    },
    onError: (err) => toast.error("Import failed: " + err.message),
  });

  const importGenericMutation = trpc.billing.importGenericInvoice.useMutation({
    onSuccess: (result) => {
      setImportResults((prev) => [
        { invoiceNumber: result.invoiceNumber, supplier: result.supplier, created: result.created, updated: result.updated, skipped: result.skipped, timestamp: result.timestamp },
        ...prev,
      ]);
      setParsedInvoice(null);
      toast.success(`Import complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`);
      // Refresh all panels that depend on service costs
      utils.billing.summary.invalidate();
      utils.billing.services.list.invalidate();
      utils.billing.margin.list.invalidate();
      utils.billing.margin.grouped.invalidate();
      utils.billing.customers.list.invalidate();
    },
    onError: (err) => toast.error("Import failed: " + err.message),
  });

  const importSasBossMutation = trpc.billing.importSasBoss.useMutation({
    onSuccess: (result) => {
      setImportResults((prev) => [
        {
          invoiceNumber: result.workbookName,
          supplier: 'SasBoss',
          created: result.matchedCount,
          updated: result.matchedCount,
          skipped: result.unmatchedCount,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
      setParsedInvoice(null);
      toast.success(
        `SasBoss import complete: ${result.matchedCount} matched, ${result.unmatchedCount} unmatched, ${result.callUsageMatchedCount} call usage records`
      );
      utils.billing.summary.invalidate();
      utils.billing.services.list.invalidate();
      utils.billing.margin.list.invalidate();
      utils.billing.margin.grouped.invalidate();
      utils.billing.customers.list.invalidate();
    },
    onError: (err) => toast.error('SasBoss import failed: ' + err.message),
  });

  const parsePdfMutation = trpc.billing.parsePdf.useMutation({
    onSuccess: (result) => {
      setParsedInvoice({ type: "pdf", ...result });
      setIsParsing(false);
    },
    onError: (err) => {
      setParseError(err.message);
      setIsParsing(false);
    },
  });

  const handleFile = useCallback(
    (file: File) => {
      setParseError(null);
      setParsedInvoice(null);

      const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
      const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
      const isXlsx = file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls");

      if (isXlsx) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const buffer = e.target?.result as ArrayBuffer;
            const workbook = parseSasBossWorkbook(buffer, file.name);
            setParsedInvoice(workbook);
          } catch (err: unknown) {
            setParseError(err instanceof Error ? err.message : 'Failed to parse workbook');
          }
        };
        reader.readAsArrayBuffer(file);
        return;
      }

      if (isPdf) {
        setIsParsing(true);
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = (e.target?.result as string).split(",")[1];
          parsePdfMutation.mutate({ base64, filename: file.name });
        };
        reader.readAsDataURL(file);
        return;
      }

      if (isCsv) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          try {
            const supplier = detectCsvSupplier(content);
            if (!supplier) {
              setParseError(
                "Could not detect supplier format. Supported CSV: Exetel (INV-YYYY-MM-DD-E*.csv). For Channel Haus, Legion, and Tech-e, upload the PDF invoice."
              );
              return;
            }
            const invoice = parseExetelCsv(content);
            setParsedInvoice(invoice);
          } catch (err: unknown) {
            setParseError(err instanceof Error ? err.message : "Failed to parse file");
          }
        };
        reader.readAsText(file);
        return;
      }

      setParseError("Unsupported file type. Please upload a CSV (Exetel), PDF (Channel Haus, Legion, Tech-e, Vine Direct, Infinet, Blitznet), or XLSX (SasBoss Dispatch Workbook).");
    },
    [parsePdfMutation, importSasBossMutation]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleConfirmImport = () => {
    if (!parsedInvoice) return;

    if (parsedInvoice.type === "xlsx") {
      importSasBossMutation.mutate({
        workbookName: parsedInvoice.workbookName,
        billingMonth: parsedInvoice.billingMonth,
        invoiceReference: parsedInvoice.invoiceReference,
        pivotRows: parsedInvoice.pivotRows,
        callUsageRows: parsedInvoice.callUsageRows,
      });
      return;
    }

    if (parsedInvoice.type === "csv") {
      importExetelMutation.mutate({
        invoiceNumber: parsedInvoice.invoiceNumber,
        rows: parsedInvoice.recurringRows.map((r) => ({
          serviceNumber: r.serviceNumber,
          idTag: r.idTag,
          category: r.category,
          description: r.description,
          totalIncGst: r.totalIncGst,
          billStart: r.billStart,
          billEnd: r.billEnd,
          chargeType: r.chargeType,
          avcId: r.avcId,
        })),
      });
    } else {
      importGenericMutation.mutate({
        supplier: parsedInvoice.supplier,
        invoiceNumber: parsedInvoice.invoiceNumber,
        rows: parsedInvoice.services.map((s) => ({
          friendlyName: s.friendlyName,
          serviceType: s.serviceType,
          amountExGst: s.amountExGst,
          serviceId: s.serviceId,
        })),
      });
    }
  };

  const isImporting = importExetelMutation.isPending || importGenericMutation.isPending || importSasBossMutation.isPending;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold">Supplier Invoices</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload supplier invoices to update service costs. Supports Exetel CSV and Channel Haus / Legion / Tech-e / Vine Direct / Infinet / Blitznet PDF formats.
        </p>
      </div>

      {/* Upload zone */}
      {!parsedInvoice && !isParsing && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/30"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.pdf,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <div className="flex items-center justify-center gap-3 mb-3">
            <Upload className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Drop a supplier invoice here</p>
          <p className="text-xs text-muted-foreground mt-1">
            or click to browse · CSV (Exetel) · PDF (Channel Haus, Legion, Tech-e, Vine Direct, Infinet, Blitznet) · XLSX (SasBoss)
          </p>
        </div>
      )}

      {/* Parsing spinner */}
      {isParsing && (
        <div className="flex items-center justify-center gap-3 p-12 border-2 border-dashed border-border rounded-xl">
          <RefreshCw className="w-5 h-5 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Parsing PDF invoice…</p>
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <div className="mt-4 flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Could not parse file</p>
            <p className="text-xs mt-0.5">{parseError}</p>
          </div>
          <button onClick={() => setParseError(null)} className="ml-auto shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Invoice preview */}
      {parsedInvoice && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Invoice Preview</h2>
            <button
              onClick={() => setParsedInvoice(null)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          </div>
          {parsedInvoice.type === "xlsx" ? (
            <SasBossPreview
              workbook={parsedInvoice}
              onConfirm={handleConfirmImport}
              isImporting={isImporting}
            />
          ) : parsedInvoice.type === "csv" ? (
            <ExetelPreview
              invoice={parsedInvoice}
              onConfirm={handleConfirmImport}
              isImporting={isImporting}
            />
          ) : (
            <PdfInvoicePreview
              invoice={parsedInvoice}
              onConfirm={handleConfirmImport}
              isImporting={isImporting}
            />
          )}
        </div>
      )}

      {/* Import history */}
      {importResults.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold mb-3">Import History (this session)</h2>
          <div className="space-y-2">
            {importResults.map((result, idx) => (
              <div
                key={idx}
                className="flex items-center gap-4 p-3 bg-card border border-border rounded-lg text-sm"
              >
                <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                <ProviderBadge provider={result.supplier} size="sm" />
                <span className="font-mono text-xs text-muted-foreground">{result.invoiceNumber}</span>
                <div className="flex items-center gap-3 ml-auto text-xs text-muted-foreground">
                  <span className="text-green-600 font-medium">+{result.created} created</span>
                  <span className="text-blue-600 font-medium">{result.updated} updated</span>
                  {result.skipped > 0 && <span>{result.skipped} skipped</span>}
                  <span>{result.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ABB Carbon API Sync */}
      <AbbCarbonSyncSection />

      {/* Supported formats */}
      <div className="mt-8 p-4 bg-muted/30 rounded-lg">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Supported Invoice Formats
        </h3>
        <div className="space-y-3">
          {[
            {
              provider: "Exetel",
              label: "Exetel (SmileIT account)",
              detail: "File pattern: INV-YYYY-MM-DD-E*.csv · CSV format",
              fileType: "CSV",
              status: "Supported",
              statusClass: "bg-green-50 text-green-700 border-green-200",
            },
            {
              provider: "ChannelHaus",
              label: "Channel Haus",
              detail: "PDF invoice · Voice (SIP trunks, PBX) and Internet services",
              fileType: "PDF",
              status: "Supported",
              statusClass: "bg-green-50 text-green-700 border-green-200",
            },
            {
              provider: "Legion",
              label: "Legion Telecom",
              detail: "PDF invoice · Fibre Internet services",
              fileType: "PDF",
              status: "Supported",
              statusClass: "bg-green-50 text-green-700 border-green-200",
            },
            {
              provider: "Tech-e",
              label: "Tech-e",
              detail: "PDF invoice · Internet services",
              fileType: "PDF",
              status: "Supported",
              statusClass: "bg-green-50 text-green-700 border-green-200",
            },
            {
              provider: "VineDirect",
              label: "Vine Direct",
              detail: "PDF invoice · Business Internet (NBN/Fibre)",
              fileType: "PDF",
              status: "Supported",
              statusClass: "bg-green-50 text-green-700 border-green-200",
            },
            {
              provider: "Infinet",
              label: "Infinet",
              detail: "PDF invoice · NBN SkyMuster & VOIP services",
              fileType: "PDF",
              status: "Supported",
              statusClass: "bg-green-50 text-green-700 border-green-200",
            },
            {
              provider: "Blitznet",
              label: "Blitznet",
              detail: "PDF invoice · Internet & Static IP services",
              fileType: "PDF",
              status: "Supported",
              statusClass: "bg-green-50 text-green-700 border-green-200",
            },
            {
              provider: "ABB",
              label: "ABB / Aussie Broadband",
              detail: "Carbon API integration (live sync)",
              fileType: "API",
              status: "Via API",
              statusClass: "bg-muted text-muted-foreground border-border",
            },
            {
              provider: "SasBoss",
              label: "SasBoss Dispatch Charges",
              detail: "XLSX workbook · Voice/UCaaS services (UCXcel, DID numbers, call packs)",
              fileType: "XLSX",
              status: "Supported",
              statusClass: "bg-green-50 text-green-700 border-green-200",
            },
            {
              provider: "Telstra",
              label: "Telstra",
              detail: "CSV upload — coming soon",
              fileType: "CSV",
              status: "Coming soon",
              statusClass: "bg-muted text-muted-foreground border-border",
            },
          ].map((fmt) => (
            <div
              key={fmt.provider}
              className={`flex items-center gap-3 ${fmt.status === "Coming soon" ? "opacity-50" : ""}`}
            >
              <ProviderBadge provider={fmt.provider} size="sm" />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium">{fmt.label}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground border border-border flex items-center gap-1">
                    <FileType className="w-2.5 h-2.5" />
                    {fmt.fileType}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">{fmt.detail}</p>
              </div>
              <span
                className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium border ${fmt.statusClass}`}
              >
                {fmt.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
