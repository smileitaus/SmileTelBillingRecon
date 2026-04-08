import { useState, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Package,
  Wifi,
  Smartphone,
  HardDrive,
  Phone,
  Headphones,
  Plus,
  Trash2,
  Link2,
  Link2Off,
  AlertTriangle,
  CheckCircle2,
  Search,
  ChevronLeft,
  ChevronRight,
  Edit2,
  X,
  Download,
  FileText,
  Zap,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type SlotType = "internet" | "sim_4g" | "hardware" | "sip_channel" | "support" | "other";

const SLOT_META: Record<SlotType, { label: string; icon: React.ReactNode; color: string }> = {
  internet: { label: "Internet (NBN)", icon: <Wifi className="w-4 h-4" />, color: "text-blue-500" },
  sim_4g: { label: "4G SIM", icon: <Smartphone className="w-4 h-4" />, color: "text-purple-500" },
  hardware: { label: "Hardware Rental", icon: <HardDrive className="w-4 h-4" />, color: "text-orange-500" },
  sip_channel: { label: "SIP Channel", icon: <Phone className="w-4 h-4" />, color: "text-green-500" },
  support: { label: "Support", icon: <Headphones className="w-4 h-4" />, color: "text-cyan-500" },
  other: { label: "Other", icon: <Package className="w-4 h-4" />, color: "text-gray-500" },
};

// Cost source badge colours and labels
const COST_SOURCE_META: Record<string, { label: string; color: string; bg: string }> = {
  carbon:       { label: "Carbon", color: "text-purple-700", bg: "bg-purple-100" },
  tiab:         { label: "TIAB",   color: "text-blue-700",   bg: "bg-blue-100" },
  vocus:        { label: "Vocus",  color: "text-indigo-700", bg: "bg-indigo-100" },
  service_link: { label: "Linked", color: "text-green-700",  bg: "bg-green-100" },
  default:      { label: "Default",color: "text-gray-500",   bg: "bg-gray-100" },
  manual:       { label: "Manual", color: "text-amber-700",  bg: "bg-amber-100" },
  default_sim:  { label: "SIM Dflt",color: "text-orange-700",bg: "bg-orange-100" },
  pricebook:    { label: "Pricebook",color:"text-teal-700",  bg: "bg-teal-100" },
};

function CostSourceBadge({ source }: { source: string }) {
  const meta = COST_SOURCE_META[source] ?? { label: source, color: "text-gray-500", bg: "bg-gray-100" };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${meta.bg} ${meta.color}`}>
      {source === "carbon" && <Zap className="w-2.5 h-2.5 mr-0.5" />}
      {meta.label}
    </span>
  );
}

function marginBadge(margin: number | null) {
  if (margin === null) return <Badge variant="outline" className="text-xs">No costs</Badge>;
  if (margin < 10) return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">{margin.toFixed(1)}% ⚠</Badge>;
  if (margin < 20) return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">{margin.toFixed(1)}%</Badge>;
  return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">{margin.toFixed(1)}%</Badge>;
}

function confidenceBadge(conf: string) {
  const map: Record<string, { cls: string; label: string }> = {
    exact:  { cls: "bg-green-100 text-green-700",   label: "exact" },
    high:   { cls: "bg-blue-100 text-blue-700",     label: "high" },
    medium: { cls: "bg-yellow-100 text-yellow-700", label: "medium" },
    low:    { cls: "bg-orange-100 text-orange-700", label: "low" },
    none:   { cls: "bg-red-100 text-red-600",       label: "unlinked" },
  };
  const entry = map[conf] ?? { cls: "bg-gray-100 text-gray-500", label: conf };
  return (
    <Badge className={`text-xs ${entry.cls}`}>
      {entry.label}
    </Badge>
  );
}

// ── Summary Cards ─────────────────────────────────────────────────────────────

function SummaryCards() {
  const { data } = trpc.retailBundles.getSummary.useQuery();
  if (!data) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <Card>
        <CardContent className="pt-4">
          <div className="text-2xl font-bold text-foreground">{data.totalBundles}</div>
          <div className="text-xs text-muted-foreground mt-1">Total Bundles</div>
          <div className="text-xs text-muted-foreground">{data.matchedBundles} matched · {data.unmatchedBundles} unmatched</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="text-2xl font-bold text-foreground">${data.totalRetailRevenue.toFixed(0)}</div>
          <div className="text-xs text-muted-foreground mt-1">Monthly Revenue (ex GST)</div>
          <div className="text-xs text-muted-foreground">Avg ${data.avgRetailPrice.toFixed(2)}/bundle</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="text-2xl font-bold text-foreground">
            {data.avgMargin !== null ? `${data.avgMargin.toFixed(1)}%` : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Avg Margin</div>
          <div className="text-xs text-muted-foreground">
            <span className="text-red-600">{data.criticalMarginCount} critical</span>
            {" · "}
            <span className="text-amber-600">{data.warningMarginCount} warning</span>
            {" · "}
            <span className="text-green-600">{data.healthyMarginCount} healthy</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="text-2xl font-bold text-foreground">{data.totalCostInputs}</div>
          <div className="text-xs text-muted-foreground mt-1">Cost Inputs</div>
          <div className="text-xs text-muted-foreground">
            {data.linkedInputs} linked · {data.defaultInputs} default · {data.manualInputs} manual
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Service Picker with live cost preview ─────────────────────────────────────

function ServicePickerDialog({
  open,
  onClose,
  costInputId,
  bundleId,
  slotType,
  onAssigned,
}: {
  open: boolean;
  onClose: () => void;
  costInputId: number;
  bundleId: number;
  slotType: string;
  onAssigned: () => void;
}) {
  const [serviceSearch, setServiceSearch] = useState("");
  const [selectedSvcId, setSelectedSvcId] = useState<number | null>(null);

  const { data: services } = trpc.retailBundles.getServicesForSlot.useQuery(
    { bundleId, slotType, search: serviceSearch || undefined },
    { enabled: open }
  );

  // Preview live cost for selected service
  const { data: liveCost, isFetching: costFetching } = trpc.retailBundles.resolveServiceCost.useQuery(
    { serviceId: selectedSvcId!, slotType },
    { enabled: open && selectedSvcId !== null }
  );

  const assignMutation = trpc.retailBundles.assignServiceSlotWithLiveCost.useMutation({
    onSuccess: (result) => {
      const sourceLabel = COST_SOURCE_META[result.costSource]?.label ?? result.costSource;
      toast.success(`Service linked — $${result.resolvedCost.toFixed(2)}/mo (${sourceLabel})`);
      onAssigned();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const meta = SLOT_META[slotType as SlotType] ?? SLOT_META.other;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={meta.color}>{meta.icon}</span>
            Link Service to {meta.label} Slot
          </DialogTitle>
        </DialogHeader>

        <Input
          placeholder="Search services..."
          value={serviceSearch}
          onChange={(e) => setServiceSearch(e.target.value)}
          className="mb-3"
        />

        <div className="max-h-52 overflow-y-auto space-y-1">
          {services?.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">No services found</div>
          )}
          {services?.map((svc: any) => (
            <div
              key={svc.id}
              className={`flex items-center justify-between p-2 rounded border cursor-pointer transition-colors ${
                selectedSvcId === svc.id
                  ? "border-primary bg-primary/5"
                  : "border-border/50 hover:bg-accent"
              }`}
              onClick={() => setSelectedSvcId(svc.id === selectedSvcId ? null : svc.id)}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{svc.planName || svc.serviceType}</div>
                <div className="text-xs text-muted-foreground">{svc.provider} · {svc.externalId}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <div className="text-sm font-mono text-muted-foreground">${svc.monthlyCost.toFixed(2)}</div>
                {selectedSvcId === svc.id && (
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Live cost preview */}
        {selectedSvcId !== null && (
          <div className="mt-3 p-3 rounded-lg border border-border bg-muted/30">
            <div className="text-xs font-semibold text-muted-foreground mb-1">Live Cost Preview</div>
            {costFetching ? (
              <div className="text-xs text-muted-foreground">Resolving cost...</div>
            ) : liveCost ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CostSourceBadge source={liveCost.source} />
                  <span className="text-xs text-muted-foreground">{liveCost.detail}</span>
                </div>
                <span className="text-base font-bold text-foreground font-mono">
                  ${liveCost.cost.toFixed(2)}/mo
                </span>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={selectedSvcId === null || assignMutation.isPending}
            onClick={() => {
              if (selectedSvcId === null) return;
              const svc = services?.find((s: any) => s.id === selectedSvcId);
              if (!svc) return;
              assignMutation.mutate({
                costInputId,
                serviceId: selectedSvcId,
                serviceExternalId: svc.externalId,
                slotType,
              });
            }}
          >
            {assignMutation.isPending ? "Linking..." : "Link Service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Cost Input Row ────────────────────────────────────────────────────────────

function CostInputRow({
  input,
  bundleId,
  onRefresh,
}: {
  input: any;
  bundleId: number;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editCost, setEditCost] = useState(String(input.monthlyCostExGst));
  const [editLabel, setEditLabel] = useState(input.label);
  const [showServicePicker, setShowServicePicker] = useState(false);

  const updateMutation = trpc.retailBundles.updateCostInput.useMutation({
    onSuccess: () => { setEditing(false); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  const removeMutation = trpc.retailBundles.removeCostInput.useMutation({
    onSuccess: () => onRefresh(),
    onError: (e) => toast.error(e.message),
  });

  const unassignMutation = trpc.retailBundles.unassignServiceSlot.useMutation({
    onSuccess: () => { toast.success("Service unlinked"); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  const meta = SLOT_META[input.slotType as SlotType] ?? SLOT_META.other;
  const isLinked = Boolean(input.linkedServiceId);

  return (
    <>
      <div className="flex items-center gap-3 p-2 rounded-lg border border-border/50 bg-card/50 group hover:bg-card transition-colors">
        {/* Slot icon */}
        <div className={`flex-shrink-0 ${meta.color}`}>{meta.icon}</div>

        {/* Label + source */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <Input
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              className="h-6 text-xs px-1"
            />
          ) : (
            <div className="text-sm font-medium truncate">{input.label}</div>
          )}
          <div className="flex items-center gap-1.5 mt-0.5">
            <CostSourceBadge source={input.costSource} />
            {input.linkedServicePlanName && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                {input.linkedServicePlanName}
              </span>
            )}
          </div>
        </div>

        {/* Cost */}
        <div className="flex-shrink-0 w-24 text-right">
          {editing ? (
            <Input
              value={editCost}
              onChange={(e) => setEditCost(e.target.value)}
              className="h-6 text-xs px-1 text-right"
              type="number"
              step="0.01"
            />
          ) : (
            <span className="text-sm font-mono font-semibold">${Number(input.monthlyCostExGst).toFixed(2)}</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {editing ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => updateMutation.mutate({ id: input.id, label: editLabel, monthlyCostExGst: Number(editCost) })}
              >
                Save
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditing(false)}>
                <X className="w-3 h-3" />
              </Button>
            </>
          ) : (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditing(true)}>
                      <Edit2 className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit cost</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {isLinked ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm" variant="ghost" className="h-6 w-6 p-0 text-green-500"
                        onClick={() => unassignMutation.mutate({ costInputId: input.id })}
                      >
                        <Link2Off className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Unlink service</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm" variant="ghost" className="h-6 w-6 p-0"
                        onClick={() => setShowServicePicker(true)}
                      >
                        <Link2 className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Link to service (auto-resolves live cost)</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400"
                      onClick={() => removeMutation.mutate({ id: input.id })}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Remove input</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
        </div>
      </div>

      {/* Service Picker Dialog with live cost preview */}
      <ServicePickerDialog
        open={showServicePicker}
        onClose={() => setShowServicePicker(false)}
        costInputId={input.id}
        bundleId={bundleId}
        slotType={input.slotType}
        onAssigned={onRefresh}
      />
    </>
  );
}

// ── Bundle Detail Panel ───────────────────────────────────────────────────────

function BundleDetailPanel({ bundleId, onClose }: { bundleId: number; onClose: () => void }) {
  const [showAddInput, setShowAddInput] = useState(false);
  const [newSlotType, setNewSlotType] = useState<SlotType>("other");
  const [newLabel, setNewLabel] = useState("");
  const [newCost, setNewCost] = useState("");

  const { data: bundle, refetch } = trpc.retailBundles.getBundleDetail.useQuery({ id: bundleId });

  const addMutation = trpc.retailBundles.addCostInput.useMutation({
    onSuccess: () => {
      setShowAddInput(false);
      setNewLabel("");
      setNewCost("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!bundle) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>
  );

  const totalCost = bundle.costInputs?.reduce((s: number, i: any) => s + Number(i.monthlyCostExGst), 0) ?? 0;
  const gp = bundle.retailPriceExGst - totalCost;
  const margin = bundle.retailPriceExGst > 0 ? (gp / bundle.retailPriceExGst) * 100 : 0;
  const marginColor = margin < 10 ? "text-red-600" : margin < 20 ? "text-amber-600" : "text-green-600";

  // Count live-linked vs default slots
  const liveSlots = bundle.costInputs?.filter((i: any) => ["carbon", "tiab", "vocus", "service_link"].includes(i.costSource)).length ?? 0;
  const defaultSlots = bundle.costInputs?.filter((i: any) => i.costSource === "default").length ?? 0;

  const componentBadges = [
    bundle.hasInternet && <Badge key="nbn" className="bg-blue-100 text-blue-700 text-xs">NBN</Badge>,
    bundle.hasSim && <Badge key="sim" className="bg-purple-100 text-purple-700 text-xs">4G SIM</Badge>,
    bundle.hasVoip && <Badge key="voip" className="bg-green-100 text-green-700 text-xs">VOIP</Badge>,
    bundle.hasHardware && !bundle.isByod && <Badge key="hw" className="bg-orange-100 text-orange-700 text-xs">Hardware</Badge>,
    bundle.isByod && <Badge key="byod" className="bg-gray-100 text-gray-600 text-xs">BYOD</Badge>,
    bundle.hasSupport && <Badge key="sup" className="bg-cyan-100 text-cyan-700 text-xs">Support</Badge>,
  ].filter(Boolean);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-border">
        <div>
          <div className="font-semibold text-foreground text-sm leading-tight">{bundle.subscriberName}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            OB: {bundle.oneBillAccountNumber}
            {bundle.customerName && <span className="ml-2 text-foreground/70">→ {bundle.customerName}</span>}
          </div>
          <div className="flex flex-wrap gap-1 mt-2">{componentBadges}</div>
        </div>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Product name */}
      <div className="px-4 py-2 border-b border-border/50 bg-muted/30">
        <div className="text-xs text-muted-foreground">Legacy product name</div>
        <div className="text-xs font-mono text-foreground/80">{bundle.legacyProductName}</div>
        {bundle.standardProductName && (
          <>
            <div className="text-xs text-muted-foreground mt-1">Standardised</div>
            <div className="text-xs font-medium text-foreground">{bundle.standardProductName}</div>
          </>
        )}
      </div>

      {/* Financials */}
      <div className="grid grid-cols-3 gap-2 p-4 border-b border-border/50">
        <div className="text-center">
          <div className="text-base font-bold text-foreground">${bundle.retailPriceExGst.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">Retail (ex GST)</div>
        </div>
        <div className="text-center">
          <div className="text-base font-bold text-foreground">${totalCost.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">
            Total Costs
            {liveSlots > 0 && (
              <span className="ml-1 text-purple-600 font-medium">({liveSlots} live)</span>
            )}
          </div>
        </div>
        <div className="text-center">
          <div className={`text-base font-bold ${marginColor}`}>
            {margin.toFixed(1)}%
          </div>
          <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            Margin
            {margin < 10 && <AlertTriangle className="w-3 h-3 text-red-500" />}
            {margin >= 20 && <TrendingUp className="w-3 h-3 text-green-500" />}
          </div>
        </div>
      </div>

      {/* Cost source legend */}
      {defaultSlots > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
          <span className="text-xs text-amber-700">
            {defaultSlots} slot{defaultSlots > 1 ? "s" : ""} using default costs — link services for live pricing
          </span>
        </div>
      )}

      {/* Cost inputs */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cost Inputs</div>
          <Button
            size="sm" variant="outline" className="h-6 text-xs px-2"
            onClick={() => setShowAddInput(!showAddInput)}
          >
            <Plus className="w-3 h-3 mr-1" /> Add
          </Button>
        </div>

        {showAddInput && (
          <div className="p-3 rounded-lg border border-dashed border-border bg-muted/20 space-y-2 mb-3">
            <Select value={newSlotType} onValueChange={(v) => setNewSlotType(v as SlotType)}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SLOT_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="h-7 text-xs"
            />
            <Input
              placeholder="Monthly cost ex GST"
              value={newCost}
              onChange={(e) => setNewCost(e.target.value)}
              type="number"
              step="0.01"
              className="h-7 text-xs"
            />
            <div className="flex gap-2">
              <Button
                size="sm" className="h-6 text-xs flex-1"
                onClick={() => addMutation.mutate({
                  bundleId,
                  slotType: newSlotType,
                  label: newLabel,
                  monthlyCostExGst: Number(newCost),
                })}
                disabled={!newLabel || !newCost}
              >
                Add Input
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowAddInput(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {bundle.costInputs?.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-4">No cost inputs yet</div>
        )}

        {bundle.costInputs?.map((ci: any) => (
          <CostInputRow key={ci.id} input={ci} bundleId={bundleId} onRefresh={refetch} />
        ))}
      </div>

      {/* GP summary */}
      <div className="p-4 border-t border-border bg-muted/20">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Gross Profit</span>
          <span className={`font-semibold ${gp < 0 ? "text-red-600" : "text-foreground"}`}>${gp.toFixed(2)}/mo</span>
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span className="text-muted-foreground">Match confidence</span>
          {confidenceBadge(bundle.matchConfidence)}
        </div>
      </div>
    </div>
  );
}

// ── Margin Report Dialog ──────────────────────────────────────────────────────

function MarginReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [marginFilter, setMarginFilter] = useState<"all" | "critical" | "warning" | "healthy">("all");
  const [groupBy, setGroupBy] = useState<"bundle_type" | "customer" | "none">("bundle_type");

  const { data: report, isLoading } = trpc.retailBundles.exportMarginReport.useQuery(
    { marginFilter, groupBy },
    { enabled: open }
  );

  // CSV download
  const downloadCsv = useCallback(() => {
    if (!report) return;
    const headers = [
      "OB Account", "Subscriber", "Customer", "Bundle Type", "Legacy Product",
      "Retail (ex GST)", "Total Cost (ex GST)", "Gross Profit", "Margin %",
      "Margin Status", "BYOD", "Has VOIP", "Match Confidence",
      "Internet Cost", "SIM Cost", "Hardware Cost", "SIP Cost", "Support Cost",
      "Carbon Slots", "TIAB Slots", "Vocus Slots", "Default Slots"
    ];

    const rows = report.items.map((item: any) => {
      const getSlotCost = (type: string) => {
        const slot = item.costBreakdown?.find((s: any) => s.slotType === type);
        return slot ? slot.cost.toFixed(2) : "0.00";
      };
      return [
        item.oneBillAccountNumber,
        `"${item.subscriberName.replace(/"/g, '""')}"`,
        `"${item.customerName.replace(/"/g, '""')}"`,
        `"${item.bundleType}"`,
        `"${item.legacyProductName.replace(/"/g, '""')}"`,
        item.retailPriceExGst.toFixed(2),
        item.totalCostExGst.toFixed(2),
        item.grossProfit.toFixed(2),
        item.marginPercent !== null ? item.marginPercent.toFixed(1) : "",
        item.marginClass,
        item.isByod ? "Yes" : "No",
        item.hasVoip ? "Yes" : "No",
        item.matchConfidence,
        getSlotCost("internet"),
        getSlotCost("sim_4g"),
        getSlotCost("hardware"),
        getSlotCost("sip_channel"),
        getSlotCost("support"),
        item.carbonSlots,
        item.tiabSlots,
        item.vocusSlots,
        item.defaultSlots,
      ];
    });

    const csv = [headers.join(","), ...rows.map((r: any[]) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smiletel-bundle-margin-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  }, [report]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Bundle Margin Report
          </DialogTitle>
        </DialogHeader>

        {/* Controls */}
        <div className="flex gap-3 items-center">
          <Select value={marginFilter} onValueChange={(v) => setMarginFilter(v as any)}>
            <SelectTrigger className="w-36 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All margins</SelectItem>
              <SelectItem value="critical">Critical (&lt;10%)</SelectItem>
              <SelectItem value="warning">Warning (10–20%)</SelectItem>
              <SelectItem value="healthy">Healthy (≥20%)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
            <SelectTrigger className="w-40 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bundle_type">Group by type</SelectItem>
              <SelectItem value="customer">Group by customer</SelectItem>
              <SelectItem value="none">No grouping</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={downloadCsv} disabled={!report}>
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
        </div>

        {/* Summary bar */}
        {report && (
          <div className="grid grid-cols-4 gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="text-center">
              <div className="text-lg font-bold">{report.summary.totalBundles}</div>
              <div className="text-xs text-muted-foreground">Bundles</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">${report.summary.totalRevenue.toFixed(0)}</div>
              <div className="text-xs text-muted-foreground">Revenue/mo</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">${report.summary.totalGP.toFixed(0)}</div>
              <div className="text-xs text-muted-foreground">GP/mo</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">
                {report.summary.avgMargin !== null ? `${report.summary.avgMargin.toFixed(1)}%` : "—"}
              </div>
              <div className="text-xs text-muted-foreground">Avg Margin</div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && <div className="text-center py-8 text-muted-foreground">Loading report...</div>}
          {report && (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 sticky top-0">
                  <TableHead className="text-xs">Subscriber</TableHead>
                  <TableHead className="text-xs">OB Acct</TableHead>
                  <TableHead className="text-xs">Bundle Type</TableHead>
                  <TableHead className="text-xs text-right">Retail</TableHead>
                  <TableHead className="text-xs text-right">Cost</TableHead>
                  <TableHead className="text-xs text-right">GP</TableHead>
                  <TableHead className="text-xs text-right">Margin</TableHead>
                  <TableHead className="text-xs">Sources</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.items.map((item: any) => (
                  <TableRow
                    key={item.id}
                    className={
                      item.marginClass === "critical" ? "bg-red-50/50" :
                      item.marginClass === "warning" ? "bg-amber-50/50" : ""
                    }
                  >
                    <TableCell className="text-xs font-medium max-w-[160px] truncate">
                      {item.subscriberName}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {item.oneBillAccountNumber}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                      {item.bundleType}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      ${item.retailPriceExGst.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-muted-foreground">
                      ${item.totalCostExGst.toFixed(2)}
                    </TableCell>
                    <TableCell className={`text-xs text-right font-mono font-semibold ${item.grossProfit < 0 ? "text-red-600" : "text-foreground"}`}>
                      ${item.grossProfit.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {marginBadge(item.marginPercent)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {item.carbonSlots > 0 && <CostSourceBadge source="carbon" />}
                        {item.tiabSlots > 0 && <CostSourceBadge source="tiab" />}
                        {item.vocusSlots > 0 && <CostSourceBadge source="vocus" />}
                        {item.defaultSlots > 0 && <CostSourceBadge source="default" />}
                        {item.manualSlots > 0 && <CostSourceBadge source="manual" />}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Re-link Bundle Dialog ────────────────────────────────────────────────────

function RelinkBundleDialog({
  bundleId,
  subscriberName,
  currentCustomerName,
  onRelink,
  isPending,
  onClose,
}: {
  bundleId: number;
  subscriberName: string;
  currentCustomerName: string | null;
  onRelink: (customerExternalId: string | null) => void;
  isPending: boolean;
  onClose: () => void;
}) {
  const [searchQ, setSearchQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const { data: customers, isLoading } = trpc.retailBundles.searchCustomersForBundle.useQuery(
    { query: debouncedQ }
  );

  const handleSearch = (val: string) => {
    setSearchQ(val);
    clearTimeout((window as any).__relinkTimer);
    (window as any).__relinkTimer = setTimeout(() => setDebouncedQ(val), 300);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Re-link Bundle to Customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <div className="text-sm font-medium text-foreground">{subscriberName}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Currently linked to: <span className="font-medium">{currentCustomerName ?? '(none)'}</span>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-8 h-9"
              placeholder="Search customer name or ID..."
              value={searchQ}
              onChange={(e) => handleSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border">
            {isLoading && (
              <div className="text-xs text-muted-foreground text-center py-4">Searching...</div>
            )}
            {!isLoading && customers?.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">No customers found</div>
            )}
            {customers?.map((c) => (
              <button
                key={c.externalId}
                className={`w-full text-left px-3 py-2 hover:bg-accent transition-colors ${
                  selectedId === c.externalId ? 'bg-accent' : ''
                }`}
                onClick={() => { setSelectedId(c.externalId); setSelectedName(c.name); }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-foreground">{c.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{c.externalId}</div>
                  </div>
                  <div className="flex gap-2 text-xs">
                    {c.billingItemCount > 0 && (
                      <Badge className="bg-green-100 text-green-700 text-xs">{c.billingItemCount} billing items</Badge>
                    )}
                    {c.bundleCount > 0 && (
                      <Badge className="bg-blue-100 text-blue-700 text-xs">{c.bundleCount} bundles</Badge>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {selectedId && (
            <div className="text-xs text-muted-foreground">
              Will link to: <span className="font-medium text-foreground">{selectedName}</span> ({selectedId})
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onRelink(null)} disabled={isPending}>
            <Link2Off className="w-3.5 h-3.5 mr-1" /> Unlink
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={() => selectedId && onRelink(selectedId)}
            disabled={!selectedId || isPending}
          >
            <Link2 className="w-3.5 h-3.5 mr-1" />
            {isPending ? 'Saving...' : 'Re-link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RetailBundles() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [confidenceFilter, setConfidenceFilter] = useState("all");
  const [voipFilter, setVoipFilter] = useState<string>("all");
  const [byodFilter, setByodFilter] = useState<string>("all");
  const [selectedBundleId, setSelectedBundleId] = useState<number | null>(null);
  const [showMarginReport, setShowMarginReport] = useState(false);
  const [relinkBundle, setRelinkBundle] = useState<{ id: number; subscriberName: string; currentCustomerName: string | null } | null>(null);

  const { data, isLoading } = trpc.retailBundles.listBundles.useQuery({
    page,
    pageSize: 40,
    search: debouncedSearch || undefined,
    matchConfidence: confidenceFilter as any,
    hasVoip: voipFilter === "yes" ? true : voipFilter === "no" ? false : undefined,
    isByod: byodFilter === "yes" ? true : byodFilter === "no" ? false : undefined,
  });

  // Debounce search
  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout((window as any).__searchTimer);
    (window as any).__searchTimer = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 350);
  };

  const utils = trpc.useUtils();
  const relinkMut = trpc.retailBundles.relinkBundle.useMutation({
    onSuccess: (data) => {
      toast.success(`Re-linked to ${data.customerName ?? 'unlinked'}`);
      utils.retailBundles.listBundles.invalidate();
      setRelinkBundle(null);
    },
    onError: (e) => toast.error(`Re-link failed: ${e.message}`),
  });

  return (
    <DashboardLayout>
      {/* Re-link Bundle Dialog */}
      {relinkBundle && (
        <RelinkBundleDialog
          bundleId={relinkBundle.id}
          subscriberName={relinkBundle.subscriberName}
          currentCustomerName={relinkBundle.currentCustomerName}
          onRelink={(customerExternalId) => relinkMut.mutate({ bundleId: relinkBundle.id, customerExternalId })}
          isPending={relinkMut.isPending}
          onClose={() => setRelinkBundle(null)}
        />
      )}
      <div className="flex h-full overflow-hidden">
        {/* Left: list */}
        <div className={`flex flex-col ${selectedBundleId ? "w-3/5" : "w-full"} transition-all duration-200 overflow-hidden`}>
          {/* Page header */}
          <div className="px-6 py-4 border-b border-border bg-background flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground">Retail Internet Bundles</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                163 bundled customers — link services to auto-resolve live wholesale costs
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMarginReport(true)}
              className="flex items-center gap-2"
            >
              <TrendingDown className="w-4 h-4" />
              Margin Report
            </Button>
          </div>

          <div className="px-6 py-4 overflow-y-auto flex-1">
            {/* Summary cards */}
            <SummaryCards />

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search subscriber, account, product..."
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={confidenceFilter} onValueChange={(v) => { setConfidenceFilter(v); setPage(1); }}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="Match" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All matches</SelectItem>
                  <SelectItem value="exact">Exact</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="none">Unmatched</SelectItem>
                </SelectContent>
              </Select>
              <Select value={voipFilter} onValueChange={(v) => { setVoipFilter(v); setPage(1); }}>
                <SelectTrigger className="w-32 h-9">
                  <SelectValue placeholder="VOIP" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All VOIP</SelectItem>
                  <SelectItem value="yes">Has VOIP</SelectItem>
                  <SelectItem value="no">No VOIP</SelectItem>
                </SelectContent>
              </Select>
              <Select value={byodFilter} onValueChange={(v) => { setByodFilter(v); setPage(1); }}>
                <SelectTrigger className="w-32 h-9">
                  <SelectValue placeholder="BYOD" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All HW</SelectItem>
                  <SelectItem value="no">Hardware incl.</SelectItem>
                  <SelectItem value="yes">BYOD</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs">Subscriber</TableHead>
                    <TableHead className="text-xs">OB Account</TableHead>
                    <TableHead className="text-xs">Product</TableHead>
                    <TableHead className="text-xs">Components</TableHead>
                    <TableHead className="text-xs text-right">Retail</TableHead>
                    <TableHead className="text-xs text-right">Costs</TableHead>
                    <TableHead className="text-xs text-right">Margin</TableHead>
                    <TableHead className="text-xs">Match</TableHead>
                    <TableHead className="text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading...</TableCell>
                    </TableRow>
                  )}
                  {!isLoading && data?.items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No bundles found</TableCell>
                    </TableRow>
                  )}
                  {data?.items.map((bundle: any) => {
                    const isSelected = selectedBundleId === bundle.id;
                    return (
                      <TableRow
                        key={bundle.id}
                        className={`cursor-pointer hover:bg-accent/50 transition-colors ${isSelected ? "bg-accent" : ""}`}
                        onClick={() => setSelectedBundleId(isSelected ? null : bundle.id)}
                      >
                        <TableCell className="text-sm font-medium max-w-[180px] truncate">
                          {bundle.subscriberName}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {bundle.oneBillAccountNumber}
                        </TableCell>
                        <TableCell className="text-xs max-w-[140px] truncate text-muted-foreground">
                          {bundle.standardProductName || bundle.legacyProductName}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {bundle.hasInternet && <span title="NBN"><Wifi className="w-3 h-3 text-blue-500" /></span>}
                            {bundle.hasSim && <span title="4G SIM"><Smartphone className="w-3 h-3 text-purple-500" /></span>}
                            {bundle.hasVoip && <span title="VOIP"><Phone className="w-3 h-3 text-green-500" /></span>}
                            {bundle.hasHardware && !bundle.isByod && <span title="Hardware"><HardDrive className="w-3 h-3 text-orange-500" /></span>}
                            {bundle.isByod && <span title="BYOD" className="text-xs text-gray-400">BYOD</span>}
                            {bundle.hasSupport && <span title="Support"><Headphones className="w-3 h-3 text-cyan-500" /></span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono">
                          ${bundle.retailPriceExGst.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono text-muted-foreground">
                          {bundle.totalCostExGst !== null ? `$${bundle.totalCostExGst.toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {marginBadge(bundle.marginPercent)}
                        </TableCell>
                        <TableCell>
                          {confidenceBadge(bundle.matchConfidence)}
                        </TableCell>
                        <TableCell className="p-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-6 w-6 p-0 hover:opacity-100 ${
                                    bundle.customerExternalId
                                      ? "text-emerald-500 opacity-80"
                                      : "text-amber-500 opacity-90"
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRelinkBundle({
                                      id: bundle.id,
                                      subscriberName: bundle.subscriberName,
                                      currentCustomerName: bundle.customerName ?? null,
                                    });
                                  }}
                                >
                                  {bundle.customerExternalId
                                    ? <Link2 className="w-3 h-3" />
                                    : <Link2Off className="w-3 h-3" />
                                  }
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {bundle.customerExternalId
                                  ? `Linked to ${bundle.customerName ?? bundle.customerExternalId} — click to re-link`
                                  : "Not linked to a customer — click to link"
                                }
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {data && data.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-xs text-muted-foreground">
                  {data.total} bundles · page {data.page} of {data.totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm" variant="outline" className="h-7"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm" variant="outline" className="h-7"
                    onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                    disabled={page === data.totalPages}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: detail panel */}
        {selectedBundleId && (
          <div className="w-2/5 border-l border-border bg-background overflow-hidden flex flex-col">
            <BundleDetailPanel
              bundleId={selectedBundleId}
              onClose={() => setSelectedBundleId(null)}
            />
          </div>
        )}
      </div>

      {/* Margin Report Dialog */}
      <MarginReportDialog
        open={showMarginReport}
        onClose={() => setShowMarginReport(false)}
      />
    </DashboardLayout>
  );
}
