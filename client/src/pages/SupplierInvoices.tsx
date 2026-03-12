/**
 * Supplier Invoices — Upload and import supplier invoices (Exetel, ABB, etc.)
 * Parses CSV files client-side, shows a preview, then submits to the server for import.
 */
import { useState, useRef, useCallback } from "react";
import { Upload, FileText, CheckCircle, AlertTriangle, X, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { ProviderBadge } from "@/components/ProviderBadge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ── Exetel CSV Parser ─────────────────────────────────────────────────────────

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

interface ParsedInvoice {
  supplier: "Exetel";
  invoiceNumber: string;
  rows: ExetelRow[];
  recurringRows: ExetelRow[];
  onceOffRows: ExetelRow[];
  subtotal: number;
}

function parseExetelCsv(content: string): ParsedInvoice {
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

    // Simple CSV parse (handles quoted fields)
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

    const parsePrice = (s: string) =>
      parseFloat(s.replace(/[$,]/g, "")) || 0;

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

  return { supplier: "Exetel", invoiceNumber, rows, recurringRows, onceOffRows, subtotal };
}

function detectSupplier(content: string): "Exetel" | null {
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

function InvoicePreview({
  invoice,
  onConfirm,
  isImporting,
}: {
  invoice: ParsedInvoice;
  onConfirm: () => void;
  isImporting: boolean;
}) {
  const [showOnceOff, setShowOnceOff] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-card border border-border rounded-lg">
        <div className="flex items-center gap-3">
          <ProviderBadge provider={invoice.supplier} size="md" />
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

      {/* Recurring services */}
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

      {/* Once-off / credits */}
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

      {/* Confirm */}
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

// ── Import History ────────────────────────────────────────────────────────────

interface ImportResult {
  invoiceNumber: string;
  supplier: string;
  created: number;
  updated: number;
  skipped: number;
  timestamp: string;
  details: Array<{ serviceNum: string; idTag: string; customerExtId: string; cost: number; action: string }>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SupplierInvoices() {
  const [dragOver, setDragOver] = useState(false);
  const [parsedInvoice, setParsedInvoice] = useState<ParsedInvoice | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importExetelMutation = trpc.billing.importExetelInvoice.useMutation({
    onSuccess: (result) => {
      setImportResults((prev) => [result, ...prev]);
      setParsedInvoice(null);
      toast.success(
        `Import complete: ${result.created} created, ${result.updated} updated`
      );
    },
    onError: (err) => {
      toast.error("Import failed: " + err.message);
    },
  });

  const handleFile = useCallback((file: File) => {
    setParseError(null);
    setParsedInvoice(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      try {
        const supplier = detectSupplier(content);
        if (!supplier) {
          setParseError(
            "Could not detect supplier format. Currently supported: Exetel (SmileIT invoices)."
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
  }, []);

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
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold">Supplier Invoices</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload supplier invoices to update service costs. Currently supports Exetel (SmileIT account) CSV format.
        </p>
      </div>

      {/* Upload zone */}
      {!parsedInvoice && (
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
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">Drop a supplier invoice CSV here</p>
          <p className="text-xs text-muted-foreground mt-1">
            or click to browse · Supported: Exetel (INV-YYYY-MM-DD-*.csv)
          </p>
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
          <InvoicePreview
            invoice={parsedInvoice}
            onConfirm={handleConfirmImport}
            isImporting={importExetelMutation.isPending}
          />
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

      {/* Supported formats */}
      <div className="mt-8 p-4 bg-muted/30 rounded-lg">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Supported Invoice Formats
        </h3>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <ProviderBadge provider="Exetel" size="sm" />
            <div>
              <p className="text-xs font-medium">Exetel (SmileIT account)</p>
              <p className="text-[11px] text-muted-foreground">
                File pattern: <span className="font-mono">INV-YYYY-MM-DD-E*.csv</span> · Columns: Item ID, Reference No, ID Tag, Category, Service Number, Item Description, Quantity, Unit Price (inc-GST), Total (inc-GST), Bill Start Date, Bill End Date, Charge Type, AVC Id
              </p>
            </div>
            <span className="ml-auto text-[10px] px-2 py-0.5 bg-green-50 text-green-700 rounded-full font-medium border border-green-200">
              Supported
            </span>
          </div>
          <div className="flex items-center gap-3 opacity-50">
            <ProviderBadge provider="ABB" size="sm" />
            <div>
              <p className="text-xs font-medium">ABB / Aussie Broadband</p>
              <p className="text-[11px] text-muted-foreground">Carbon API integration (live sync)</p>
            </div>
            <span className="ml-auto text-[10px] px-2 py-0.5 bg-muted text-muted-foreground rounded-full font-medium border border-border">
              Via API
            </span>
          </div>
          <div className="flex items-center gap-3 opacity-50">
            <ProviderBadge provider="Telstra" size="sm" />
            <div>
              <p className="text-xs font-medium">Telstra</p>
              <p className="text-[11px] text-muted-foreground">CSV upload — coming soon</p>
            </div>
            <span className="ml-auto text-[10px] px-2 py-0.5 bg-muted text-muted-foreground rounded-full font-medium border border-border">
              Coming soon
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
