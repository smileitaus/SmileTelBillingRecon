/**
 * SasBossPricebook — Versioned SasBoss/Access4 product pricebook.
 *
 * Shows:
 *  - Active version header (label, effective date, import timestamp, source file)
 *  - Version history selector
 *  - Searchable, filterable product table grouped by sheet (UCaaS / Managed Voice / Phone Hardware)
 *  - Cost sync preview & apply (SasBoss-platform services only)
 *
 * Cost updates are ONLY applied to services whose billingPlatforms includes "SasBoss".
 * Services on other platforms (DataGate, ChannelHaus, TIAB, etc.) are never touched.
 */

import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import {
  BookOpen,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileText,
  Zap,
  Eye,
  ArrowRight,
  Package,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrency(val: string | number | null | undefined) {
  if (val === null || val === undefined || val === "") return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function fmtMargin(val: string | number | null | undefined) {
  if (val === null || val === undefined || val === "") return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  const pct = n * 100;
  const color =
    pct < 0 ? "text-red-600" : pct < 20 ? "text-amber-600" : "text-emerald-600";
  return <span className={color}>{pct.toFixed(1)}%</span>;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SHEET_META: Record<
  string,
  { label: string; color: string; badgeClass: string }
> = {
  UCaaS: {
    label: "UCaaS",
    color: "bg-blue-50 border-blue-200",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-200",
  },
  "Managed Voice": {
    label: "Managed Voice — Bundles",
    color: "bg-green-50 border-green-200",
    badgeClass: "bg-green-100 text-green-800 border-green-200",
  },
  "Managed Voice - DID Hosting": {
    label: "Managed Voice — DID Hosting",
    color: "bg-teal-50 border-teal-200",
    badgeClass: "bg-teal-100 text-teal-800 border-teal-200",
  },
  "Managed Voice - Porting": {
    label: "Managed Voice — Porting / DID Rates",
    color: "bg-cyan-50 border-cyan-200",
    badgeClass: "bg-cyan-100 text-cyan-800 border-cyan-200",
  },
  "Phone Hardware": {
    label: "Phone Hardware & Devices",
    color: "bg-gray-50 border-gray-200",
    badgeClass: "bg-gray-100 text-gray-800 border-gray-200",
  },
};

const SHEET_ORDER = [
  "UCaaS",
  "Managed Voice",
  "Managed Voice - DID Hosting",
  "Managed Voice - Porting",
  "Phone Hardware",
];

// ── Sub-components ────────────────────────────────────────────────────────────

type PricebookItem = {
  id: number;
  product_id: number | null;
  sheet_name: string;
  product_filter: string | null;
  buy_name: string | null;
  product_name: string;
  partner_buy_price: string | null;
  partner_sell_price: string | null;
  partner_margin: string | null;
  nfr_partner_price: string | null;
  product_code: string | null;
  product_type: string | null;
  api_buy_price: string | null;
  api_rrp: string | null;
  api_nfr_price: string | null;
  api_buy_bundled: string | null;
  api_rrp_bundled: string | null;
  api_buy_unlimited: string | null;
  api_rrp_unlimited: string | null;
  api_last_synced: string | null;
  driftAmount: number | null;
  hasDrift: boolean;
};

function SheetSection({
  sheetName,
  items,
}: {
  sheetName: string;
  items: PricebookItem[];
}) {
  const [open, setOpen] = useState(sheetName !== "Phone Hardware");
  const meta = SHEET_META[sheetName] ?? {
    label: sheetName,
    color: "bg-gray-50 border-gray-200",
    badgeClass: "bg-gray-100 text-gray-800 border-gray-200",
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded border ${meta.badgeClass}`}
          >
            {meta.label}
          </span>
          <span className="text-sm text-muted-foreground">{items.length} products</span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-[40%]">Product Name</TableHead>
                <TableHead>Filter</TableHead>
                <TableHead className="text-right">Buy (PAYG)</TableHead>
                <TableHead className="text-right">RRP (PAYG)</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                {sheetName === "UCaaS" && (
                  <TableHead className="text-right">NFR</TableHead>
                )}
                <TableHead className="text-right text-purple-700">Buy (Bundled)</TableHead>
                <TableHead className="text-right text-purple-700">RRP (Bundled)</TableHead>
                <TableHead className="text-right text-blue-700">Buy (Unlimited)</TableHead>
                <TableHead className="text-right text-blue-700">RRP (Unlimited)</TableHead>
                <TableHead>Product ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} className="hover:bg-gray-50/50">
                  <TableCell className="font-medium text-sm">
                    {item.product_name}
                  </TableCell>
                  <TableCell>
                    {item.product_filter ? (
                      <span className="text-xs text-muted-foreground">
                        {item.product_filter}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {fmtCurrency(item.partner_buy_price)}
                    {item.api_buy_price != null && (
                      <div className={`text-xs mt-0.5 ${item.hasDrift ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}`}>
                        API: {fmtCurrency(item.api_buy_price)}
                        {item.hasDrift && item.driftAmount != null && (
                          <span className="ml-1">({item.driftAmount > 0 ? '+' : ''}{fmtCurrency(item.driftAmount)})</span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {fmtCurrency(item.partner_sell_price)}
                    {item.api_rrp != null && (
                      <div className="text-xs text-muted-foreground mt-0.5">API: {fmtCurrency(item.api_rrp)}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {fmtMargin(item.partner_margin)}
                  </TableCell>
                  {sheetName === "UCaaS" && (
                    <TableCell className="text-right font-mono text-sm">
                      {item.api_nfr_price != null ? fmtCurrency(item.api_nfr_price) : fmtCurrency(item.nfr_partner_price)}
                    </TableCell>
                  )}
                  <TableCell className="text-right font-mono text-sm text-purple-700">
                    {item.api_buy_bundled != null ? fmtCurrency(item.api_buy_bundled) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-purple-700">
                    {item.api_rrp_bundled != null ? fmtCurrency(item.api_rrp_bundled) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-blue-700">
                    {item.api_buy_unlimited != null ? fmtCurrency(item.api_buy_unlimited) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-blue-700">
                    {item.api_rrp_unlimited != null ? fmtCurrency(item.api_rrp_unlimited) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.product_id ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── Cost Sync Panel ───────────────────────────────────────────────────────────

function CostSyncPanel({ versionId }: { versionId: number }) {
  const [showPreview, setShowPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{
    updated: number;
    appliedAt: string;
    log: Array<{ externalId: string; planName: string | null; billingName: string | null; oldCost: number | null; newCost: number; matchType: string; pricebookName: string }>;
  } | null>(null);

  const utils = trpc.useUtils();

  const { data: preview, isLoading: previewLoading } =
    trpc.pricebook.previewCostSync.useQuery(
      { versionId },
      { enabled: showPreview }
    );

  const applyMutation = trpc.pricebook.applyCostSync.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setApplying(false);
      utils.billing.summary.invalidate();
      toast.success(`Cost sync complete — ${data.updated} SasBoss service${data.updated !== 1 ? "s" : ""} updated.`);
    },
    onError: (err) => {
      setApplying(false);
      toast.error(`Cost sync failed: ${err.message}`);
    },
  });

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-600" />
          Cost Sync — SasBoss Services Only
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Matches active SasBoss-billed services by <strong>billing name</strong> (not provisioning
          platform) using fuzzy normalisation — so services provisioned in Carbon, ABB, or other
          platforms but billed through SasBoss are included. Services billed on other platforms
          (DataGate, ChannelHaus, TIAB, etc.) are never modified.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {result ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-emerald-700 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              {result.updated} service{result.updated !== 1 ? "s" : ""} updated at{" "}
              {fmtDateTime(result.appliedAt)}
            </div>
            {result.log.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service ID</TableHead>
                      <TableHead>Plan / Billing Name</TableHead>
                      <TableHead>Matched Pricebook Entry</TableHead>
                      <TableHead>Match</TableHead>
                      <TableHead className="text-right">Old Cost</TableHead>
                      <TableHead className="text-right">New Cost</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.log.map((r, i) => {
                      const diff = r.newCost - (r.oldCost ?? 0);
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{r.externalId}</TableCell>
                          <TableCell className="text-sm">
                            <div>{r.planName ?? "—"}</div>
                            {r.billingName && (
                              <div className="text-xs text-muted-foreground">Billed as: {r.billingName}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{r.pricebookName}</TableCell>
                          <TableCell>
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                              r.matchType === 'exact'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {r.matchType === 'exact' ? 'Exact' : 'Fuzzy'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {fmtCurrency(r.oldCost)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {fmtCurrency(r.newCost)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono text-sm ${
                              diff < 0
                                ? "text-emerald-600"
                                : diff > 0
                                ? "text-red-600"
                                : "text-muted-foreground"
                            }`}
                          >
                            {diff > 0 ? "+" : ""}
                            {fmtCurrency(diff)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResult(null)}
            >
              Run again
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(true)}
              disabled={previewLoading}
            >
              <Eye className="w-4 h-4 mr-2" />
              {previewLoading ? "Loading preview..." : "Preview changes"}
            </Button>
            {showPreview && preview && preview.length > 0 && (
              <Button
                size="sm"
                onClick={() => {
                  setApplying(true);
                  applyMutation.mutate({ versionId });
                }}
                disabled={applying}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {applying ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-2" />
                )}
                Apply {preview.length} update{preview.length !== 1 ? "s" : ""}
              </Button>
            )}
          </div>
        )}

        {showPreview && !result && (
          <>
            {previewLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Scanning SasBoss services...
              </div>
            ) : preview && preview.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700 py-2">
                <CheckCircle2 className="w-4 h-4" />
                All SasBoss service costs already match the pricebook.
              </div>
            ) : preview && preview.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-amber-800">
                  {preview.length} service{preview.length !== 1 ? "s" : ""} will be updated:
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Plan / Billing Name</TableHead>
                        <TableHead>Matched Pricebook Entry</TableHead>
                        <TableHead>Match</TableHead>
                        <TableHead className="text-right">Current Cost</TableHead>
                        <TableHead></TableHead>
                        <TableHead className="text-right">Pricebook Cost</TableHead>
                        <TableHead className="text-right">Change</TableHead>
                        <TableHead>Sheet</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.map((row) => {
                        const oldCost = row.monthlyCost !== null ? parseFloat(row.monthlyCost) : null;
                        const newCost = row.pricebookCost !== null ? parseFloat(row.pricebookCost) : null;
                        const diff = (newCost ?? 0) - (oldCost ?? 0);
                        return (
                          <TableRow key={row.id}>
                            <TableCell className="text-sm font-medium">
                              {row.customerName ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm">
                              <div>{row.planName ?? "—"}</div>
                              {row.billingName && (
                                <div className="text-xs text-muted-foreground">Billed as: {row.billingName}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {row.pricebookName}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-0.5">
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded w-fit ${
                                  row.matchType === 'exact'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {row.matchType === 'exact' ? 'Exact' : 'Fuzzy'}
                                </span>
                                {row.matchType === 'fuzzy' && (
                                  <span className="text-xs text-muted-foreground">
                                    {Math.round(row.matchScore * 100)}%
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {fmtCurrency(oldCost)}
                            </TableCell>
                            <TableCell className="text-center">
                              <ArrowRight className="w-3 h-3 text-muted-foreground inline" />
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm font-medium">
                              {fmtCurrency(newCost)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono text-sm ${
                                diff < 0
                                  ? "text-emerald-600"
                                  : diff > 0
                                  ? "text-red-600"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {diff > 0 ? "+" : ""}
                              {fmtCurrency(diff)}
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">
                                {row.pricebookSheet}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Bundle Management Panel ──────────────────────────────────────────────────

function BundleManagementPanel({ versionId }: { versionId: number }) {
  const utils = trpc.useUtils();
  const { data: bundles, isLoading } = trpc.pricebook.listBundles.useQuery();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Create bundle form state
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"access4_formal" | "custom_smiletel">("access4_formal");
  const [newBillingName, setNewBillingName] = useState("");
  const [newBuyPrice, setNewBuyPrice] = useState("");
  const [newRrp, setNewRrp] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const createBundle = trpc.pricebook.createBundle.useMutation({
    onSuccess: () => {
      utils.pricebook.listBundles.invalidate();
      setShowCreate(false);
      setNewName(""); setNewType("access4_formal"); setNewBillingName("");
      setNewBuyPrice(""); setNewRrp(""); setNewNotes("");
      toast.success("Bundle created");
    },
    onError: (e) => toast.error("Failed to create bundle: " + e.message),
  });

  const updateBundle = trpc.pricebook.updateBundle.useMutation({
    onSuccess: () => {
      utils.pricebook.listBundles.invalidate();
      setEditingId(null);
      toast.success("Bundle updated");
    },
    onError: (e) => toast.error("Failed to update: " + e.message),
  });

  const { data: previewData, isLoading: previewLoading } =
    trpc.pricebook.previewBundleCostSync.useQuery(
      { versionId },
      { enabled: !!versionId }
    );

  const bundleTypeLabel = (t: string) =>
    t === "access4_formal" ? "Access4 Formal" : "Custom SmileTel";
  const bundleTypeBadge = (t: string) =>
    t === "access4_formal"
      ? "bg-blue-100 text-blue-800 border-blue-200"
      : "bg-purple-100 text-purple-800 border-purple-200";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="w-4 h-4 text-purple-600" />
            Product Bundle Definitions
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            New Bundle
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Bundles group multiple pricebook components into a single billing line.
          When a service billing name matches a bundle, the combined wholesale cost is used
          instead of the individual product price.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Bundle cost sync preview */}
        {previewData && previewData.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-800 mb-2">
              <Layers className="w-4 h-4 inline mr-1" />
              {previewData.length} service{previewData.length !== 1 ? "s" : ""} would receive bundle pricing on next cost sync
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Plan / Billing Name</TableHead>
                    <TableHead>Matched Bundle</TableHead>
                    <TableHead className="text-right">Current Cost</TableHead>
                    <TableHead className="text-right">Bundle Cost</TableHead>
                    <TableHead>Match</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{row.customerName ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        <div>{row.planName ?? "—"}</div>
                        {row.billingName && (
                          <div className="text-xs text-muted-foreground">Billed as: {row.billingName}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-purple-700">{row.bundleName}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtCurrency(row.oldCost)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">{fmtCurrency(row.newCost)}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          row.matchType === "exact" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          {row.matchType === "exact" ? "Exact" : `Fuzzy ${Math.round(row.matchScore * 100)}%`}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Bundle list */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading bundles...
          </div>
        ) : !bundles || bundles.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No bundle definitions yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {bundles.map((b) => (
              <div key={b.id} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 text-left transition-colors"
                >
                  <span className={`text-xs font-medium px-2 py-0.5 rounded border ${bundleTypeBadge(b.bundle_type)}`}>
                    {bundleTypeLabel(b.bundle_type)}
                  </span>
                  <span className="font-medium text-sm flex-1">{b.bundle_name}</span>
                  {b.billing_name && b.billing_name !== b.bundle_name && (
                    <span className="text-xs text-muted-foreground">Billed as: {b.billing_name}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{b.component_count} components</span>
                  <span className="font-mono text-sm font-medium text-purple-700">
                    {fmtCurrency(b.combined_buy_price ?? b.auto_combined_buy)}
                    {!b.combined_buy_price && b.auto_combined_buy && (
                      <span className="text-xs text-muted-foreground ml-1">(auto)</span>
                    )}
                  </span>
                  {b.partner_rrp && (
                    <span className="text-xs text-muted-foreground">RRP {fmtCurrency(b.partner_rrp)}</span>
                  )}
                  {!b.is_active && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
                  )}
                  {expandedId === b.id ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>

                {expandedId === b.id && (
                  <BundleDetail
                    bundleId={b.id}
                    versionId={versionId}
                    onToggleActive={() =>
                      updateBundle.mutate({ bundleId: b.id, isActive: !b.is_active })
                    }
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Create bundle dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Bundle Definition</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Bundle Name *</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Legal Professional Bundle"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Bundle Type *</Label>
              <select
                className="w-full mt-1 text-sm border rounded px-2 py-1.5 bg-white"
                value={newType}
                onChange={(e) => setNewType(e.target.value as any)}
              >
                <option value="access4_formal">Access4 Formal Bundle</option>
                <option value="custom_smiletel">Custom SmileTel Bundle</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Billing Name (as appears on SasBoss invoice)</Label>
              <Input
                value={newBillingName}
                onChange={(e) => setNewBillingName(e.target.value)}
                placeholder="Leave blank to use bundle name"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Combined Buy Price (ex GST)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newBuyPrice}
                  onChange={(e) => setNewBuyPrice(e.target.value)}
                  placeholder="Auto-calculated from components"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Partner RRP</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newRrp}
                  onChange={(e) => setNewRrp(e.target.value)}
                  placeholder="Optional"
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Optional notes about this bundle"
                className="mt-1 text-sm"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              disabled={!newName.trim() || createBundle.isPending}
              onClick={() =>
                createBundle.mutate({
                  bundleName: newName.trim(),
                  bundleType: newType,
                  billingName: newBillingName.trim() || undefined,
                  combinedBuyPrice: newBuyPrice ? parseFloat(newBuyPrice) : undefined,
                  partnerRrp: newRrp ? parseFloat(newRrp) : undefined,
                  notes: newNotes.trim() || undefined,
                })
              }
            >
              {createBundle.isPending ? "Creating..." : "Create Bundle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function BundleDetail({
  bundleId,
  versionId,
  onToggleActive,
}: {
  bundleId: number;
  versionId: number;
  onToggleActive: () => void;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.pricebook.getBundleDetail.useQuery({ bundleId });
  const [showAddComponent, setShowAddComponent] = useState(false);
  const [compName, setCompName] = useState("");
  const [compQty, setCompQty] = useState("1");
  const [compOverride, setCompOverride] = useState("");
  const [compUsesBundled, setCompUsesBundled] = useState(true);

  const addComponent = trpc.pricebook.addBundleComponent.useMutation({
    onSuccess: () => {
      utils.pricebook.getBundleDetail.invalidate({ bundleId });
      utils.pricebook.listBundles.invalidate();
      setShowAddComponent(false);
      setCompName(""); setCompQty("1"); setCompOverride("");
      toast.success("Component added");
    },
    onError: (e) => toast.error("Failed to add component: " + e.message),
  });

  const removeComponent = trpc.pricebook.removeBundleComponent.useMutation({
    onSuccess: () => {
      utils.pricebook.getBundleDetail.invalidate({ bundleId });
      utils.pricebook.listBundles.invalidate();
      toast.success("Component removed");
    },
    onError: (e) => toast.error("Failed to remove: " + e.message),
  });

  if (isLoading) return (
    <div className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading...
    </div>
  );

  const bundle = data?.bundle;
  const components = data?.components ?? [];

  return (
    <div className="border-t bg-gray-50/50 px-4 py-3 space-y-3">
      {bundle?.description && (
        <p className="text-sm text-muted-foreground">{bundle.description}</p>
      )}
      {bundle?.notes && (
        <p className="text-xs text-muted-foreground italic">{bundle.notes}</p>
      )}

      {/* Components table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Components</p>
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowAddComponent(true)}>
            <Plus className="w-3 h-3 mr-1" /> Add Component
          </Button>
        </div>
        {components.length === 0 ? (
          <p className="text-xs text-muted-foreground">No components defined yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-white">
                <TableHead className="text-xs">Component</TableHead>
                <TableHead className="text-xs">Qty</TableHead>
                <TableHead className="text-xs">Price Mode</TableHead>
                <TableHead className="text-right text-xs">Standalone Buy</TableHead>
                <TableHead className="text-right text-xs">Bundled Buy</TableHead>
                <TableHead className="text-right text-xs">Effective Cost</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {components.map((c: any) => {
                const effectiveCost = c.override_buy_price !== null
                  ? parseFloat(c.override_buy_price) * c.quantity
                  : c.uses_bundled_price && c.pb_bundled_buy !== null
                  ? parseFloat(c.pb_bundled_buy) * c.quantity
                  : c.pb_standalone_buy !== null
                  ? parseFloat(c.pb_standalone_buy) * c.quantity
                  : null;
                return (
                  <TableRow key={c.id} className="bg-white">
                    <TableCell className="text-sm font-medium">{c.component_name}</TableCell>
                    <TableCell className="text-sm">{c.quantity}</TableCell>
                    <TableCell>
                      {c.override_buy_price !== null ? (
                        <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Override</span>
                      ) : c.uses_bundled_price ? (
                        <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Bundled</span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">Standalone</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {fmtCurrency(c.pb_standalone_buy)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {c.pb_bundled_buy !== null ? fmtCurrency(c.pb_bundled_buy) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium text-purple-700">
                      {effectiveCost !== null ? fmtCurrency(effectiveCost) : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                        onClick={() => removeComponent.mutate({ componentId: c.id })}
                        disabled={removeComponent.isPending}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Add component inline form */}
      {showAddComponent && (
        <div className="border rounded-lg p-3 bg-white space-y-3">
          <p className="text-xs font-semibold">Add Component</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label className="text-xs">Component Name *</Label>
              <Input
                value={compName}
                onChange={(e) => setCompName(e.target.value)}
                placeholder="e.g. UCXcel Professional"
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Quantity</Label>
              <Input
                type="number"
                min="1"
                value={compQty}
                onChange={(e) => setCompQty(e.target.value)}
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Override Buy Price (optional)</Label>
              <Input
                type="number"
                step="0.01"
                value={compOverride}
                onChange={(e) => setCompOverride(e.target.value)}
                placeholder="Leave blank to use pricebook"
                className="mt-1 text-sm"
              />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id={`bundled-${bundleId}`}
                checked={compUsesBundled}
                onChange={(e) => setCompUsesBundled(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor={`bundled-${bundleId}`} className="text-xs cursor-pointer">
                Use bundled_buy price from pricebook (recommended)
              </Label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!compName.trim() || addComponent.isPending}
              onClick={() =>
                addComponent.mutate({
                  bundleId,
                  componentName: compName.trim(),
                  quantity: parseInt(compQty) || 1,
                  usesBundledPrice: compUsesBundled,
                  overrideBuyPrice: compOverride ? parseFloat(compOverride) : undefined,
                })
              }
            >
              {addComponent.isPending ? "Adding..." : "Add"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddComponent(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          className="text-xs"
          onClick={onToggleActive}
        >
          {bundle?.is_active ? "Deactivate Bundle" : "Activate Bundle"}
        </Button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SasBossPricebook() {
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [selectedSheet, setSelectedSheet] = useState<string>("all");

  const { data: versions, isLoading: versionsLoading } =
    trpc.pricebook.listVersions.useQuery();

  const { data: summary } = trpc.pricebook.activeSummary.useQuery();

  // Show outbound IP so it can be checked against Access4 whitelist
  const { data: outboundIpData } = trpc.sasbossApi.getOutboundIp.useQuery();

  // Sync live API prices into api_buy / api_rrp / api_buy_bundled etc. columns
  const syncPricesMutation = trpc.sasbossApi.syncPrices.useMutation({
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`API prices synced — ${r.matched} matched, ${r.unmatched} unmatched from ${r.totalApiProducts} products`);
      } else {
        toast.warning(`Sync completed with warnings: ${r.errors.join('; ')} — ${r.matched} matched`);
      }
    },
    onError: (e) => toast.error(`Sync failed: ${e.message}`),
  });

  // Use selected version or default to the active one
  const activeVersionId = useMemo(() => {
    if (selectedVersionId) return selectedVersionId;
    if (versions && versions.length > 0) {
      const active = versions.find((v) => v.is_active === 1);
      return active?.id ?? versions[0].id;
    }
    return null;
  }, [selectedVersionId, versions]);

  const { data: items, isLoading: itemsLoading } =
    trpc.pricebook.getItems.useQuery(
      { versionId: activeVersionId!, search: search || undefined },
      { enabled: !!activeVersionId }
    );

  // Group by sheet
  const grouped = useMemo(() => {
    if (!items) return {};
    const g: Record<string, PricebookItem[]> = {};
    for (const item of items) {
      if (!g[item.sheet_name]) g[item.sheet_name] = [];
      g[item.sheet_name].push(item);
    }
    return g;
  }, [items]);

  const filteredSheets = useMemo(() => {
    if (selectedSheet === "all") return SHEET_ORDER.filter((s) => grouped[s]);
    return SHEET_ORDER.filter((s) => s === selectedSheet && grouped[s]);
  }, [selectedSheet, grouped]);

  const activeVersion = versions?.find((v) => v.id === activeVersionId);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <h1 className="text-2xl font-bold">SasBoss Pricebook</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Access4 / SasBoss wholesale product pricing — source of truth for all
            SasBoss-platform service costs. All prices ex GST.
          </p>
        </div>

        {/* Right-side controls: Sync button + version selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => syncPricesMutation.mutate()}
            disabled={syncPricesMutation.isPending}
            title="Fetch live prices from the SasBoss Billing API and update the API price columns"
          >
            {syncPricesMutation.isPending
              ? <><RefreshCw className="w-4 h-4 animate-spin" />Syncing…</>
              : <><RefreshCw className="w-4 h-4" />Sync Prices from API</>}
          </Button>
          {outboundIpData?.ip && outboundIpData.ip !== 'unknown' && (
            <span className="text-xs text-muted-foreground font-mono" title="Server outbound IP — this must be whitelisted by Access4/Joel for the sync to work">
              Server IP: {outboundIpData.ip}
            </span>
          )}
          {versions && versions.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Version:</span>
              <select
                className="text-sm border rounded px-2 py-1 bg-white"
                value={activeVersionId ?? ""}
                onChange={(e) => setSelectedVersionId(Number(e.target.value))}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.version_label}
                    {v.is_active ? " (active)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Active version info card */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                Version
              </p>
              <p className="text-lg font-bold">{summary.version_label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Effective {fmtDate(summary.effective_date)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                Imported
              </p>
              <p className="text-sm font-medium">{fmtDateTime(summary.imported_at)}</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {summary.source_filename ?? "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                Voice &amp; UCaaS Products
              </p>
              <p className="text-lg font-bold">
                {(summary.voice_items ?? 0) + (summary.ucaas_items ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {summary.ucaas_items} UCaaS · {summary.voice_items} Voice
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                Hardware Items
              </p>
              <p className="text-lg font-bold">{summary.hardware_items ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Phones, ATAs, accessories
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Version history */}
      {versions && versions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Version History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>Effective Date</TableHead>
                    <TableHead>Imported At</TableHead>
                    <TableHead>Source File</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((v) => (
                    <TableRow
                      key={v.id}
                      className={
                        v.id === activeVersionId
                          ? "bg-blue-50/50"
                          : "hover:bg-gray-50/50"
                      }
                    >
                      <TableCell className="font-medium">{v.version_label}</TableCell>
                      <TableCell>{fmtDate(v.effective_date)}</TableCell>
                      <TableCell>{fmtDateTime(v.imported_at)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {v.source_filename ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {v.is_active ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Superseded
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cost sync panel */}
      {activeVersionId && <CostSyncPanel versionId={activeVersionId} />}

      {/* Bundle management panel */}
      {activeVersionId && <BundleManagementPanel versionId={activeVersionId} />}

      {/* Product table */}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <h2 className="text-lg font-semibold">Products</h2>
          <div className="flex flex-wrap gap-2 items-center">
            {/* Sheet filter */}
            <select
              className="text-sm border rounded px-2 py-1.5 bg-white"
              value={selectedSheet}
              onChange={(e) => setSelectedSheet(e.target.value)}
            >
              <option value="all">All sheets</option>
              {SHEET_ORDER.map((s) => (
                <option key={s} value={s}>
                  {SHEET_META[s]?.label ?? s}
                </option>
              ))}
            </select>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-8 w-56 text-sm"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {itemsLoading || versionsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading pricebook...
          </div>
        ) : !activeVersionId ? (
          <div className="text-center py-12 text-muted-foreground">
            <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-amber-400" />
            <p>No pricebook versions found. Import a spreadsheet to get started.</p>
          </div>
        ) : filteredSheets.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No products match your search.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSheets.map((sheet) => (
              <SheetSection
                key={sheet}
                sheetName={sheet}
                items={grouped[sheet] ?? []}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
