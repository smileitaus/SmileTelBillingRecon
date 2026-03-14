/**
 * CustomerBillingMatch - Drag-and-drop service → billing item matching page.
 *
 * Left column: Unassigned services (draggable cards)
 * Right column: Xero billing line items (droppable targets, many services per item)
 * - Live margin = Revenue (lineAmount) − Cost (sum of assigned services' monthlyCost)
 * - Auto-Match button: fuzzy Jaccard scoring proposes matches
 * - Unbillable workflow: mark services as intentionally not billed
 */
import { useState, useCallback } from "react";
import { useParams, Link } from "wouter";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProviderBadge } from "@/components/ProviderBadge";
import {
  Wifi,
  Phone,
  Smartphone,
  Package,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Ban,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type UnassignedService = {
  externalId: string;
  serviceType: string;
  serviceTypeDetail: string;
  planName: string;
  monthlyCost: number;
  provider: string;
  locationAddress: string;
  phoneNumber: string;
  status: string;
};

type AssignedService = {
  assignmentId: number;
  serviceExternalId: string;
  serviceType: string;
  planName: string;
  monthlyCost: number;
  provider: string;
  locationAddress: string;
  assignedBy: string;
  assignmentMethod: string;
};

type BillingItemWithAssignments = {
  externalId: string;
  invoiceDate: string;
  invoiceNumber: string;
  description: string;
  lineAmount: number;
  quantity: number;
  unitAmount: number;
  category: string;
  matchStatus: string;
  assignedServices: AssignedService[];
  totalCost: number;
  margin: number;
  marginPercent: number | null;
};

type FuzzyProposal = {
  serviceExternalId: string;
  servicePlanName: string;
  serviceType: string;
  billingItemExternalId: string;
  billingDescription: string;
  score: number;
  scorePercent: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serviceTypeIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes("internet") || t.includes("nbn") || t.includes("broadband") || t.includes("data"))
    return <Wifi className="w-4 h-4" />;
  if (t.includes("voice") || t.includes("phone") || t.includes("sip") || t.includes("did"))
    return <Phone className="w-4 h-4" />;
  if (t.includes("mobile") || t.includes("sim"))
    return <Smartphone className="w-4 h-4" />;
  return <Package className="w-4 h-4" />;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
}

function MarginBadge({ margin, marginPercent }: { margin: number; marginPercent: number | null }) {
  if (marginPercent === null) return <span className="text-muted-foreground text-xs">No revenue</span>;
  const pct = Math.round(marginPercent);
  if (pct >= 20)
    return (
      <span className="flex items-center gap-1 text-emerald-600 text-xs font-semibold">
        <TrendingUp className="w-3 h-3" /> {fmt(margin)} ({pct}%)
      </span>
    );
  if (pct >= 0)
    return (
      <span className="flex items-center gap-1 text-amber-600 text-xs font-semibold">
        <Minus className="w-3 h-3" /> {fmt(margin)} ({pct}%)
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-red-600 text-xs font-semibold">
      <TrendingDown className="w-3 h-3" /> {fmt(margin)} ({pct}%)
    </span>
  );
}

// ─── Draggable Service Card ───────────────────────────────────────────────────

function DraggableServiceCard({
  service,
  isDragging,
}: {
  service: UnassignedService;
  isDragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: service.externalId,
    data: { service },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-card border rounded-lg p-3 cursor-grab active:cursor-grabbing select-none transition-shadow ${
        isDragging ? "opacity-40" : "hover:shadow-md hover:border-primary/40"
      }`}
    >
      <div className="flex items-start gap-2">
        <div {...listeners} {...attributes} className="mt-0.5 text-muted-foreground">
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-muted-foreground">{serviceTypeIcon(service.serviceType)}</span>
            <span className="font-medium text-sm truncate">{service.planName || service.serviceType}</span>
            <ProviderBadge provider={service.provider} size="xs" />
          </div>
          {service.locationAddress && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{service.locationAddress}</p>
          )}
          {service.phoneNumber && (
            <p className="text-xs text-muted-foreground">{service.phoneNumber}</p>
          )}
          <p className="text-xs font-semibold text-orange-600 mt-1">
            Supplier cost: {fmt(service.monthlyCost)}/mo
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Droppable Billing Item ───────────────────────────────────────────────────

function DroppableBillingItem({
  item,
  isOver,
  onRemoveService,
  onExpand,
  expanded,
}: {
  item: BillingItemWithAssignments;
  isOver: boolean;
  onRemoveService: (billingItemExternalId: string, serviceExternalId: string) => void;
  onExpand: () => void;
  expanded: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: item.externalId });

  return (
    <div
      ref={setNodeRef}
      className={`border rounded-lg transition-all ${
        isOver
          ? "border-primary bg-primary/5 shadow-lg ring-2 ring-primary/30"
          : "border-border bg-card hover:border-primary/30"
      }`}
    >
      {/* Header */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-snug line-clamp-2">{item.description}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {item.invoiceNumber} · {item.invoiceDate}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-emerald-700">{fmt(item.lineAmount)}</p>
            <p className="text-xs text-muted-foreground">revenue</p>
          </div>
        </div>

        {/* Margin row */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-dashed">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Cost: <span className="text-orange-600 font-semibold">{fmt(item.totalCost)}</span></span>
            <span>Margin: <MarginBadge margin={item.margin} marginPercent={item.marginPercent} /></span>
          </div>
          <button
            onClick={onExpand}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {item.assignedServices.length} service{item.assignedServices.length !== 1 ? "s" : ""}
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Drop hint */}
        {isOver && (
          <div className="mt-2 rounded-md bg-primary/10 border border-primary/30 px-3 py-2 text-xs text-primary font-medium text-center">
            Drop to assign service
          </div>
        )}
      </div>

      {/* Assigned services list (expandable) */}
      {expanded && item.assignedServices.length > 0 && (
        <div className="border-t bg-muted/30 rounded-b-lg">
          {item.assignedServices.map(svc => (
            <div
              key={svc.serviceExternalId}
              className="flex items-center justify-between gap-2 px-3 py-2 border-b last:border-b-0"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-muted-foreground">{serviceTypeIcon(svc.serviceType)}</span>
                <span className="text-xs truncate">{svc.planName || svc.serviceType}</span>
                <ProviderBadge provider={svc.provider} size="xs" />
                {svc.assignmentMethod === "auto" && (
                  <Badge variant="outline" className="text-xs py-0 h-4">auto</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-orange-600 font-semibold">{fmt(svc.monthlyCost)}</span>
                <button
                  onClick={() => onRemoveService(item.externalId, svc.serviceExternalId)}
                  className="text-muted-foreground hover:text-red-500 transition-colors"
                  title="Remove assignment"
                >
                  <XCircle className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CustomerBillingMatch() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const utils = trpc.useUtils();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const [activeService, setActiveService] = useState<UnassignedService | null>(null);
  const [overItemId, setOverItemId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [showUnbillableDialog, setShowUnbillableDialog] = useState(false);
  const [unbillableTarget, setUnbillableTarget] = useState<UnassignedService | null>(null);
  const [unbillableReason, setUnbillableReason] = useState("intentionally-unbilled");
  const [unbillableNotes, setUnbillableNotes] = useState("");
  const [showAutoMatchPreview, setShowAutoMatchPreview] = useState(false);
  const [acceptedProposals, setAcceptedProposals] = useState<Set<string>>(new Set());

  // Queries
  const { data: customer } = trpc.billing.customers.byId.useQuery({ id: customerId });
  const { data: billingItems = [], isLoading: loadingItems, refetch: refetchItems } =
    trpc.billing.customers.billingAssignments.billingItemsWithAssignments.useQuery({
      customerExternalId: customerId,
    });
  const { data: unassignedServices = [], isLoading: loadingServices, refetch: refetchServices } =
    trpc.billing.customers.billingAssignments.unassignedServices.useQuery({
      customerExternalId: customerId,
    });
  const { data: unbillableServices = [], refetch: refetchUnbillable } =
    trpc.billing.customers.billingAssignments.unbillableServices.useQuery({
      customerExternalId: customerId,
    });
  const { data: fuzzyProposals = [], isLoading: loadingFuzzy } =
    trpc.billing.customers.billingAssignments.fuzzyProposals.useQuery({
      customerExternalId: customerId,
    });

  // Mutations
  const assignMutation = trpc.billing.customers.billingAssignments.assign.useMutation({
    onSuccess: () => {
      refetchItems();
      refetchServices();
    },
    onError: (err) => toast.error(`Assignment failed: ${err.message}`),
  });

  const removeMutation = trpc.billing.customers.billingAssignments.removeAssignment.useMutation({
    onSuccess: () => {
      refetchItems();
      refetchServices();
    },
    onError: (err) => toast.error(`Remove failed: ${err.message}`),
  });

  const markUnbillableMutation = trpc.billing.customers.billingAssignments.markUnbillable.useMutation({
    onSuccess: () => {
      refetchServices();
      refetchUnbillable();
      setShowUnbillableDialog(false);
      setUnbillableTarget(null);
      setUnbillableNotes("");
      toast.success("Service marked as intentionally unbilled");
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const unmarkUnbillableMutation = trpc.billing.customers.billingAssignments.unmarkUnbillable.useMutation({
    onSuccess: () => {
      refetchServices();
      refetchUnbillable();
      toast.success("Service restored to unassigned");
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  // Drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const svc = event.active.data.current?.service as UnassignedService;
    setActiveService(svc || null);
  }, []);

  const handleDragOver = useCallback((event: { over: { id: string } | null }) => {
    setOverItemId(event.over?.id || null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveService(null);
      setOverItemId(null);
      const { active, over } = event;
      if (!over) return;
      const serviceExternalId = String(active.id);
      const billingItemExternalId = String(over.id);
      assignMutation.mutate({
        billingItemExternalId,
        serviceExternalId,
        customerExternalId: customerId,
        assignmentMethod: "drag-drop",
      });
    },
    [assignMutation, customerId]
  );

  // Auto-match: accept all proposals
  const handleAcceptAllProposals = useCallback(async () => {
    const toAccept = fuzzyProposals.filter(p => !acceptedProposals.has(p.serviceExternalId));
    for (const proposal of toAccept) {
      await assignMutation.mutateAsync({
        billingItemExternalId: proposal.billingItemExternalId,
        serviceExternalId: proposal.serviceExternalId,
        customerExternalId: customerId,
        assignmentMethod: "auto",
        notes: `Auto-matched (${proposal.scorePercent}% confidence)`,
      });
      setAcceptedProposals(prev => new Set(Array.from(prev).concat(proposal.serviceExternalId)));
    }
    setShowAutoMatchPreview(false);
    toast.success(`${toAccept.length} services auto-matched`);
  }, [fuzzyProposals, acceptedProposals, assignMutation, customerId]);

  const handleAcceptProposal = useCallback(
    async (proposal: FuzzyProposal) => {
      await assignMutation.mutateAsync({
        billingItemExternalId: proposal.billingItemExternalId,
        serviceExternalId: proposal.serviceExternalId,
        customerExternalId: customerId,
        assignmentMethod: "auto",
        notes: `Auto-matched (${proposal.scorePercent}% confidence)`,
      });
      setAcceptedProposals(prev => new Set(Array.from(prev).concat(proposal.serviceExternalId)));
    },
    [assignMutation, customerId]
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Summary stats
  const totalRevenue = billingItems.reduce((s, i) => s + i.lineAmount, 0);
  const totalCost = billingItems.reduce((s, i) => s + i.totalCost, 0);
  const totalMargin = totalRevenue - totalCost;
  const totalMarginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : null;

  const isLoading = loadingItems || loadingServices;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href={`/customers/${customerId}`}>
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            </Link>
            <Separator orientation="vertical" className="h-5" />
            <div>
              <h1 className="font-semibold text-base leading-tight">
                Billing Match — {customer?.name || customerId}
              </h1>
              <p className="text-xs text-muted-foreground">
                Drag services onto billing items to assign them. Multiple services per item.
              </p>
            </div>
          </div>

          {/* Summary stats */}
          <div className="hidden md:flex items-center gap-4 text-sm">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Revenue</p>
              <p className="font-bold text-emerald-700">{fmt(totalRevenue)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Cost</p>
              <p className="font-bold text-orange-600">{fmt(totalCost)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Margin</p>
              <p className={`font-bold ${totalMargin >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                {fmt(totalMargin)}
                {totalMarginPct !== null && ` (${Math.round(totalMarginPct)}%)`}
              </p>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Unassigned</p>
              <p className={`font-bold ${unassignedServices.length > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                {unassignedServices.length}
              </p>
            </div>
          </div>

          {/* Auto-match button */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => setShowAutoMatchPreview(true)}
            disabled={loadingFuzzy || fuzzyProposals.length === 0}
          >
            {loadingFuzzy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-amber-500" />
            )}
            Auto-Match ({fuzzyProposals.filter(p => !acceptedProposals.has(p.serviceExternalId)).length})
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver as never}
          onDragEnd={handleDragEnd}
        >
          <div className="max-w-[1600px] mx-auto px-4 py-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT: Unassigned Services */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Unassigned Services
                  <Badge variant="secondary">{unassignedServices.length}</Badge>
                </h2>
                <p className="text-xs text-muted-foreground">Drag onto a billing item →</p>
              </div>

              {unassignedServices.length === 0 ? (
                <div className="border rounded-lg p-8 text-center text-muted-foreground">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                  <p className="font-medium">All services assigned!</p>
                  <p className="text-xs mt-1">Every active service has been linked to a billing item.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {unassignedServices.map(svc => (
                    <div key={svc.externalId} className="flex items-stretch gap-2">
                      <div className="flex-1">
                        <DraggableServiceCard
                          service={svc}
                          isDragging={activeService?.externalId === svc.externalId}
                        />
                      </div>
                      <button
                        onClick={() => {
                          setUnbillableTarget(svc);
                          setShowUnbillableDialog(true);
                        }}
                        className="shrink-0 w-8 flex items-center justify-center rounded-lg border border-dashed text-muted-foreground hover:text-red-500 hover:border-red-300 transition-colors"
                        title="Mark as intentionally unbilled"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Unbillable services section */}
              {unbillableServices.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Ban className="w-3.5 h-3.5" />
                    Intentionally Unbilled ({unbillableServices.length})
                  </h3>
                  <div className="space-y-1.5">
                    {unbillableServices.map((u) => (
                      <div
                        key={u.serviceExternalId}
                        className="flex items-center justify-between gap-2 bg-muted/40 border rounded-lg px-3 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-muted-foreground">{serviceTypeIcon(u.serviceType)}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{u.planName || u.serviceType}</p>
                            <p className="text-xs text-muted-foreground">{u.reason}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => unmarkUnbillableMutation.mutate({ serviceExternalId: u.serviceExternalId })}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          title="Restore to unassigned"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: Billing Items */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  Xero Billing Items
                  <Badge variant="secondary">{billingItems.length}</Badge>
                </h2>
                <p className="text-xs text-muted-foreground">← Drop services here</p>
              </div>

              {billingItems.length === 0 ? (
                <div className="border rounded-lg p-8 text-center text-muted-foreground">
                  <p className="font-medium">No billing items found</p>
                  <p className="text-xs mt-1">Import Xero billing data for this customer first.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {billingItems.map(item => (
                    <DroppableBillingItem
                      key={item.externalId}
                      item={item}
                      isOver={overItemId === item.externalId}
                      onRemoveService={(billingItemExternalId, serviceExternalId) =>
                        removeMutation.mutate({ billingItemExternalId, serviceExternalId })
                      }
                      onExpand={() => toggleExpand(item.externalId)}
                      expanded={expandedItems.has(item.externalId)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Drag Overlay */}
          <DragOverlay>
            {activeService && (
              <div className="opacity-90 rotate-1 shadow-xl">
                <DraggableServiceCard service={activeService} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Unbillable Dialog */}
      <Dialog open={showUnbillableDialog} onOpenChange={setShowUnbillableDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Service as Intentionally Unbilled</DialogTitle>
          </DialogHeader>
          {unbillableTarget && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-3">
                <p className="font-medium text-sm">{unbillableTarget.planName || unbillableTarget.serviceType}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Supplier cost: {fmt(unbillableTarget.monthlyCost)}/mo
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Reason</label>
                <Select value={unbillableReason} onValueChange={setUnbillableReason}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="intentionally-unbilled">Intentionally not billed</SelectItem>
                    <SelectItem value="internal-use">Internal use / test service</SelectItem>
                    <SelectItem value="bundled">Bundled into another item</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Notes (optional)</label>
                <Textarea
                  className="mt-1"
                  placeholder="Add context for future reference..."
                  value={unbillableNotes}
                  onChange={e => setUnbillableNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowUnbillableDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!unbillableTarget) return;
                markUnbillableMutation.mutate({
                  serviceExternalId: unbillableTarget.externalId,
                  customerExternalId: customerId,
                  reason: unbillableReason,
                  notes: unbillableNotes || undefined,
                });
              }}
              disabled={markUnbillableMutation.isPending}
            >
              {markUnbillableMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Ban className="w-4 h-4 mr-2" />
              )}
              Mark Unbilled
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto-Match Preview Dialog */}
      <Dialog open={showAutoMatchPreview} onOpenChange={setShowAutoMatchPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Auto-Match Proposals
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Review fuzzy-matched proposals below. Accept individually or accept all at once.
          </p>
          <div className="space-y-3 mt-2">
            {fuzzyProposals
              .filter(p => !acceptedProposals.has(p.serviceExternalId))
              .map(proposal => (
                <div
                  key={proposal.serviceExternalId}
                  className="border rounded-lg p-3 flex items-start justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{proposal.servicePlanName || proposal.serviceType}</span>
                      <Badge
                        variant="outline"
                        className={
                          proposal.scorePercent >= 70
                            ? "border-emerald-400 text-emerald-700"
                            : proposal.scorePercent >= 50
                            ? "border-amber-400 text-amber-700"
                            : "border-orange-400 text-orange-700"
                        }
                      >
                        {proposal.scorePercent}% match
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      → {proposal.billingDescription}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1"
                    onClick={() => handleAcceptProposal(proposal)}
                    disabled={assignMutation.isPending}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Accept
                  </Button>
                </div>
              ))}
            {fuzzyProposals.filter(p => !acceptedProposals.has(p.serviceExternalId)).length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                <p>All proposals accepted!</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAutoMatchPreview(false)}>
              Close
            </Button>
            {fuzzyProposals.filter(p => !acceptedProposals.has(p.serviceExternalId)).length > 0 && (
              <Button onClick={handleAcceptAllProposals} disabled={assignMutation.isPending}>
                {assignMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2 text-amber-500" />
                )}
                Accept All
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
