/**
 * Internet Pricebook Page
 * Displays SmileTel Internet Services pricing (ABB TC4, EE, FW) with:
 *  - Version management (import XLSX, delete)
 *  - Carbon API cost validation with live variance display
 *  - Low-margin flagging (warning < 20%, critical < 10%)
 *  - Filters: service type, support tier, contract term, zone, low-margin only
 *  - Inline sell price override
 *  - All prices ex GST
 */

import { useState, useRef, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, CheckCircle2, XCircle, RefreshCw, Upload, Trash2, Edit2, Info, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { toast } from 'sonner';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (v: string | number | null | undefined, decimals = 2) => {
  if (v == null || v === '') return '—';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return '—';
  return `$${n.toFixed(decimals)}`;
};

const pct = (v: string | number | null | undefined) => {
  if (v == null || v === '') return '—';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
  tc4: 'TC4 NBN',
  tc4_gold: 'TC4 NBN (Gold)',
  tc4_bronze: 'TC4 NBN (Bronze)',
  tc4_home_ultrafast: 'TC4 Home Ultra Fast',
  fw_plus: 'Fixed Wireless Plus',
  fw_ent_plus: 'FW Enterprise Plus',
  ee: 'Enterprise Ethernet',
};

const CONTRACT_LABELS: Record<string, string> = {
  m2m: 'M2M',
  '12m': '12 Months',
  '24m': '24 Months',
  '36m': '36 Months',
};

const SUPPORT_LABELS: Record<string, string> = {
  standard: 'Standard',
  premium: 'Premium',
};

// ─── Low-margin badge ─────────────────────────────────────────────────────────
function MarginBadge({ flag, margin }: { flag: number; margin: string }) {
  const pctVal = parseFloat(margin) * 100;
  if (flag === 2) {
    return (
      <span className="inline-flex items-center gap-1 text-red-400 font-semibold">
        <XCircle className="w-3.5 h-3.5" />
        {pctVal.toFixed(1)}%
      </span>
    );
  }
  if (flag === 1) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-400 font-semibold">
        <AlertTriangle className="w-3.5 h-3.5" />
        {pctVal.toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
      <CheckCircle2 className="w-3.5 h-3.5" />
      {pctVal.toFixed(1)}%
    </span>
  );
}

// ─── Carbon variance indicator ────────────────────────────────────────────────
function CarbonVariance({ variance, validatedCost }: { variance: string | null; validatedCost: string | null }) {
  if (!validatedCost) {
    return <span className="text-muted-foreground text-xs">Not validated</span>;
  }
  const v = parseFloat(variance ?? '0');
  if (Math.abs(v) <= 1) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
        <CheckCircle2 className="w-3 h-3" />
        {fmt(validatedCost)} <span className="text-muted-foreground">(±{Math.abs(v).toFixed(2)})</span>
      </span>
    );
  }
  if (Math.abs(v) <= 5) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-400 text-xs">
        <AlertTriangle className="w-3 h-3" />
        {fmt(validatedCost)} <span className="text-muted-foreground">({v > 0 ? '+' : ''}{v.toFixed(2)})</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-red-400 text-xs">
      <XCircle className="w-3 h-3" />
      {fmt(validatedCost)} <span className="text-muted-foreground">({v > 0 ? '+' : ''}{v.toFixed(2)})</span>
    </span>
  );
}

// ─── Import dialog ────────────────────────────────────────────────────────────
function ImportDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const importMut = trpc.internetPricebook.importFromSpreadsheet.useMutation({
    onSuccess: (data) => {
      toast.success(`Imported ${data.itemCount} pricebook items (version ID ${data.versionId})`);
      setOpen(false);
      setLabel('');
      setEffectiveDate('');
      setFile(null);
      onSuccess();
    },
    onError: (e) => toast.error(`Import failed: ${e.message}`),
  });

  const handleImport = async () => {
    if (!file || !label || !effectiveDate) {
      toast.error('Please fill in all fields and select a file');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(',')[1];
      importMut.mutate({ fileBase64: base64, fileName: file.name, label, effectiveDate });
    };
    reader.readAsDataURL(file);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Upload className="w-4 h-4" />
          Import Pricebook
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Internet Pricebook</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Upload the <strong>ABBEEandTC4InternetCustomerPricing</strong> XLSX file. The system will parse
            the TC4 and EE pricing sheets and create a new versioned pricebook.
          </p>
          <div className="space-y-2">
            <Label>Version Label</Label>
            <Input
              placeholder="e.g. May 2025"
              value={label}
              onChange={e => setLabel(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Effective Date</Label>
            <Input
              type="date"
              value={effectiveDate}
              onChange={e => setEffectiveDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Spreadsheet File (.xlsx)</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                Choose File
              </Button>
              <span className="text-sm text-muted-foreground self-center">
                {file ? file.name : 'No file selected'}
              </span>
            </div>
          </div>
          <Button
            className="w-full"
            onClick={handleImport}
            disabled={importMut.isPending || !file || !label || !effectiveDate}
          >
            {importMut.isPending ? 'Importing...' : 'Import Pricebook'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit sell price dialog ───────────────────────────────────────────────────
function EditPriceDialog({
  item,
  onSuccess,
}: {
  item: { id: number; speedTier: string; supportTier: string; contractTerm: string; sellPrice: string };
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [note, setNote] = useState('');

  const updateMut = trpc.internetPricebook.updateSellPrice.useMutation({
    onSuccess: (data) => {
      toast.success(`Price updated. New margin: ${(data.newMarginPercent * 100).toFixed(1)}%`);
      setOpen(false);
      setNewPrice('');
      setNote('');
      onSuccess();
    },
    onError: (e) => toast.error(`Update failed: ${e.message}`),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-60 hover:opacity-100">
          <Edit2 className="w-3 h-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Override Sell Price</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            <strong>{item.speedTier}</strong> · {SUPPORT_LABELS[item.supportTier] ?? item.supportTier} · {CONTRACT_LABELS[item.contractTerm] ?? item.contractTerm}
          </p>
          <p className="text-sm">Current price: <strong>{fmt(item.sellPrice)}</strong> ex GST</p>
          <div className="space-y-2">
            <Label>New Sell Price (ex GST)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 99.00"
              value={newPrice}
              onChange={e => setNewPrice(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Reason / Note (optional)</Label>
            <Input
              placeholder="e.g. Competitive adjustment"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            onClick={() => updateMut.mutate({ itemId: item.id, newSellPrice: parseFloat(newPrice), note: note || undefined })}
            disabled={updateMut.isPending || !newPrice || isNaN(parseFloat(newPrice))}
          >
            {updateMut.isPending ? 'Saving...' : 'Save Override'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Summary cards (derived from filtered items) ──────────────────────────────
function SummaryCards({ items }: { items: Array<{ marginPercent: string; lowMarginFlag: number }> }) {
  const totalItems = items.length;
  const totalCrit = items.filter(i => i.lowMarginFlag === 2).length;
  const totalWarn = items.filter(i => i.lowMarginFlag === 1).length;
  const margins = items.map(i => parseFloat(i.marginPercent)).filter(n => !isNaN(n));
  const avgMargin = margins.length > 0 ? (margins.reduce((a, b) => a + b, 0) / margins.length) * 100 : null;
  const worstMargin = margins.length > 0 ? Math.min(...margins) * 100 : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <Card className="bg-card/60 border-border/50">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Items</p>
          <p className="text-2xl font-bold">{totalItems}</p>
        </CardContent>
      </Card>
      <Card className={`border-border/50 ${totalCrit > 0 ? 'bg-red-950/30' : totalWarn > 0 ? 'bg-amber-950/30' : 'bg-card/60'}`}>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Low Margin Items</p>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-bold">{totalWarn + totalCrit}</p>
            {totalCrit > 0 && <Badge variant="destructive" className="text-xs">{totalCrit} Critical</Badge>}
            {totalWarn > 0 && <Badge className="text-xs bg-amber-500/20 text-amber-400 border-amber-500/30">{totalWarn} Warning</Badge>}
          </div>
        </CardContent>
      </Card>
      <Card className="bg-card/60 border-border/50">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Avg Margin</p>
          <p className="text-2xl font-bold">{avgMargin != null ? `${avgMargin.toFixed(1)}%` : '—'}</p>
        </CardContent>
      </Card>
      <Card className={`border-border/50 ${worstMargin != null && worstMargin < 10 ? 'bg-red-950/30' : worstMargin != null && worstMargin < 20 ? 'bg-amber-950/30' : 'bg-card/60'}`}>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Worst Margin</p>
          <p className="text-2xl font-bold">{worstMargin != null ? `${worstMargin.toFixed(1)}%` : '—'}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function InternetPricebook() {
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [filterServiceType, setFilterServiceType] = useState<string>('all');
  const [filterSupportTier, setFilterSupportTier] = useState<string>('all');
  const [filterContractTerm, setFilterContractTerm] = useState<string>('all');
  const [filterZone, setFilterZone] = useState<string>('all');
  const [filterLowMarginOnly, setFilterLowMarginOnly] = useState(false);
  const [search, setSearch] = useState('');
  const utils = trpc.useUtils();

  // Versions list
  const { data: versions, refetch: refetchVersions } = trpc.internetPricebook.listVersions.useQuery();

  // Auto-select latest version
  const activeVersionId = selectedVersionId ?? versions?.[0]?.id ?? null;

  // Filter options for selected version
  const { data: filterOptions } = trpc.internetPricebook.getFilterOptions.useQuery(
    { versionId: activeVersionId! },
    { enabled: !!activeVersionId }
  );

  // Items query
  const { data: itemsData, refetch: refetchItems } = trpc.internetPricebook.listItems.useQuery(
    {
      versionId: activeVersionId!,
      serviceType: filterServiceType !== 'all' ? filterServiceType : undefined,
      supportTier: filterSupportTier !== 'all' ? filterSupportTier : undefined,
      contractTerm: filterContractTerm !== 'all' ? filterContractTerm : undefined,
      zone: filterZone !== 'all' ? filterZone : undefined,
      lowMarginOnly: filterLowMarginOnly || undefined,
      search: search || undefined,
      limit: 500,
    },
    { enabled: !!activeVersionId }
  );

  // Carbon validation mutation
  const validateMut = trpc.internetPricebook.validateCarbonCosts.useMutation({
    onSuccess: (data) => {
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success(`Carbon validation complete: ${data.updated} items updated across ${data.plansCovered} plans`);
      }
      refetchItems();
      refetchVersions();
    },
    onError: (e) => toast.error(`Validation failed: ${e.message}`),
  });

  // Delete version mutation
  const deleteMut = trpc.internetPricebook.deleteVersion.useMutation({
    onSuccess: () => {
      toast.success('Pricebook version deleted');
      setSelectedVersionId(null);
      refetchVersions();
    },
    onError: (e) => toast.error(`Delete failed: ${e.message}`),
  });

  const handleRefresh = useCallback(() => {
    refetchItems();
    refetchVersions();
  }, [refetchItems, refetchVersions]);

  const activeVersion = versions?.find(v => v.id === activeVersionId);
  const items = itemsData?.items ?? [];

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Internet Services Pricebook</h1>
            <p className="text-sm text-muted-foreground mt-1">
              All prices ex GST · ABB TC4, Enterprise Ethernet, Fixed Wireless
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ImportDialog onSuccess={() => { refetchVersions(); }} />
            {activeVersionId && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => validateMut.mutate({ versionId: activeVersionId })}
                disabled={validateMut.isPending}
              >
                <RefreshCw className={`w-4 h-4 ${validateMut.isPending ? 'animate-spin' : ''}`} />
                {validateMut.isPending ? 'Validating...' : 'Validate Carbon Costs'}
              </Button>
            )}
          </div>
        </div>

        {/* Version selector */}
        {versions && versions.length > 0 ? (
          <Card className="bg-card/60 border-border/50">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground mb-1 block">Pricebook Version</Label>
                  <Select
                    value={String(activeVersionId ?? '')}
                    onValueChange={v => setSelectedVersionId(Number(v))}
                  >
                    <SelectTrigger className="w-full sm:w-80">
                      <SelectValue placeholder="Select version" />
                    </SelectTrigger>
                    <SelectContent>
                      {versions.map(v => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.label} — {v.effectiveDate} ({Number(v.itemCount)} items)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {activeVersion && (
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>Imported {new Date(activeVersion.importedAt).toLocaleDateString()}</span>
                    {activeVersion.lastValidatedAt && (
                      <span>Validated {new Date(activeVersion.lastValidatedAt).toLocaleDateString()}</span>
                    )}
                    {Number(activeVersion.lowMarginCount) > 0 && (
                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                        {activeVersion.lowMarginCount} low-margin
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-400"
                      onClick={() => {
                        if (confirm('Delete this pricebook version and all its items?')) {
                          deleteMut.mutate({ versionId: activeVersionId! });
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-card/60 border-border/50">
            <CardContent className="p-8 text-center">
              <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">No pricebook versions imported yet.</p>
              <ImportDialog onSuccess={() => refetchVersions()} />
            </CardContent>
          </Card>
        )}

        {/* Summary cards — derived from filtered items so they update with filters */}
        {activeVersionId && <SummaryCards items={items} />}

        {/* Filters */}
        {activeVersionId && filterOptions && (
          <Card className="bg-card/60 border-border/50">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Service Type</Label>
                  <Select value={filterServiceType} onValueChange={setFilterServiceType}>
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {filterOptions.serviceTypes.map(t => (
                        <SelectItem key={t} value={t}>{SERVICE_TYPE_LABELS[t] ?? t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Support Tier</Label>
                  <Select value={filterSupportTier} onValueChange={setFilterSupportTier}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tiers</SelectItem>
                      {filterOptions.supportTiers.map(t => (
                        <SelectItem key={t} value={t}>{SUPPORT_LABELS[t] ?? t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Contract Term</Label>
                  <Select value={filterContractTerm} onValueChange={setFilterContractTerm}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Terms</SelectItem>
                      {filterOptions.contractTerms.map(t => (
                        <SelectItem key={t} value={t}>{CONTRACT_LABELS[t] ?? t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {filterOptions.zones.length > 1 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Zone</Label>
                    <Select value={filterZone} onValueChange={setFilterZone}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Zones</SelectItem>
                        {filterOptions.zones.map(z => (
                          <SelectItem key={z} value={z}>{z.toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Search</Label>
                  <Input
                    className="w-48"
                    placeholder="Speed, product code..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 pb-0.5">
                  <input
                    type="checkbox"
                    id="lowMarginOnly"
                    checked={filterLowMarginOnly}
                    onChange={e => setFilterLowMarginOnly(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="lowMarginOnly" className="text-sm cursor-pointer">
                    Low margin only
                  </Label>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilterServiceType('all');
                    setFilterSupportTier('all');
                    setFilterContractTerm('all');
                    setFilterZone('all');
                    setFilterLowMarginOnly(false);
                    setSearch('');
                  }}
                >
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pricebook table */}
        {activeVersionId && (
          <Card className="bg-card/60 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Pricebook Items
                  {itemsData && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      ({items.length} of {itemsData.total} shown)
                    </span>
                  )}
                </CardTitle>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Info className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <p className="text-xs">
                        <strong>Margin flags:</strong> ✓ ≥20% (healthy), ⚠ 10–20% (warning), ✗ &lt;10% (critical).
                        Carbon Variance shows the difference between the spreadsheet wholesale cost and the live Carbon API charge.
                        All prices are ex GST.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/20">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Speed Tier</th>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Type</th>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Support</th>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Term</th>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Zone</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Wholesale Cost</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">RRP (ex GST)</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">GP</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">Margin</th>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Carbon Live Cost</th>
                      <th className="px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="text-center py-12 text-muted-foreground">
                          No items found. Try adjusting filters or import a pricebook.
                        </td>
                      </tr>
                    ) : (
                      items.map((item, idx) => {
                        const isLowMargin = item.lowMarginFlag > 0;
                        const isCritical = item.lowMarginFlag === 2;
                        const hasOverride = !!item.sellPriceOverride;
                        return (
                          <tr
                            key={item.id}
                            className={`border-b border-border/30 hover:bg-muted/10 transition-colors ${
                              isCritical ? 'bg-red-950/10' : isLowMargin ? 'bg-amber-950/10' : ''
                            }`}
                          >
                            <td className="px-4 py-2.5">
                              <div className="font-medium">{item.speedTier}</div>
                              {item.supportNote && (
                                <div className="text-xs text-muted-foreground">{item.supportNote}</div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">
                              {SERVICE_TYPE_LABELS[item.serviceType] ?? item.serviceType}
                            </td>
                            <td className="px-3 py-2.5">
                              <Badge
                                variant="outline"
                                className={`text-xs ${item.supportTier === 'premium' ? 'border-blue-500/40 text-blue-400' : 'border-border/50'}`}
                              >
                                {SUPPORT_LABELS[item.supportTier] ?? item.supportTier}
                              </Badge>
                            </td>
                            <td className="px-3 py-2.5 text-xs">
                              {CONTRACT_LABELS[item.contractTerm] ?? item.contractTerm}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground uppercase">
                              {item.zone !== 'all' ? item.zone : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-sm">
                              {fmt(item.wholesaleCost)}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <span className={`font-mono text-sm font-semibold ${hasOverride ? 'text-blue-400' : ''}`}>
                                  {fmt(item.sellPrice)}
                                </span>
                                {hasOverride && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <Edit2 className="w-3 h-3 text-blue-400" />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="text-xs">Override by {item.overriddenBy}</p>
                                        {item.overrideNote && <p className="text-xs">{item.overrideNote}</p>}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-sm">
                              {fmt(item.grossProfit)}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <MarginBadge flag={item.lowMarginFlag} margin={item.marginPercent} />
                            </td>
                            <td className="px-3 py-2.5">
                              <CarbonVariance
                                variance={item.costVariance}
                                validatedCost={item.carbonValidatedCost}
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <EditPriceDialog item={item} onSuccess={handleRefresh} />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {itemsData && itemsData.total > 500 && (
                <div className="p-4 text-center text-sm text-muted-foreground border-t border-border/30">
                  Showing first 500 of {itemsData.total} items. Use filters to narrow results.
                </div>
              )}
              <div className="p-3 border-t border-border/30 text-xs text-muted-foreground text-right">
                All prices ex GST · Carbon costs validated against live ABB Carbon API
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
