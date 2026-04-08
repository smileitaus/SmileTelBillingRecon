import { useState, useCallback } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ArrowLeft, Zap, Link2, GripVertical, CheckCircle2, Package, Phone, Globe, Wifi, HelpCircle, ChevronRight } from "lucide-react";
import { ProviderBadge } from "@/components/ProviderBadge";

// ─── Types ────────────────────────────────────────────────────────────────────

type UnmatchedService = {
  externalId: string;
  serviceType: string;
  serviceTypeDetail: string | null;
  planName: string;
  phoneNumber: string | null;
  connectionId: string | null;
  locationAddress: string | null;
  provider: string | null;
  monthlyCost: number;
  monthlyRevenue: number;
  status: string;
};

type WorkbookItem = {
  id: number;
  productName: string;
  productType: string;
  amountExGst: number;
  amountIncGst: number;
  matchStatus: string;
  matchedServiceExternalId: string;
  serviceRefId: string;
};

type FuzzyProposal = {
  serviceExternalId: string;
  servicePlanName: string;
  workbookItemId: number;
  workbookProductName: string;
  score: number;
  amountExGst: number;
};

// ─── Service Type Icon ────────────────────────────────────────────────────────

function ServiceTypeIcon({ type }: { type: string }) {
  const t = (type || "").toLowerCase();
  if (t.includes("voice") || t.includes("phone")) return <Phone className="w-4 h-4 text-blue-500" />;
  if (t.includes("internet") || t.includes("nbn") || t.includes("fibre")) return <Wifi className="w-4 h-4 text-green-500" />;
  if (t.includes("mobile")) return <Phone className="w-4 h-4 text-purple-500" />;
  if (t.includes("data")) return <Globe className="w-4 h-4 text-teal-500" />;
  return <Package className="w-4 h-4 text-muted-foreground" />;
}

function scoreColor(score: number) {
  if (score >= 70) return "bg-green-100 text-green-800 border-green-200";
  if (score >= 50) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  return "bg-orange-100 text-orange-800 border-orange-200";
}

// ─── Draggable Service Card ───────────────────────────────────────────────────

function DraggableServiceCard({ service, isDragging }: { service: UnmatchedService; isDragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `service-${service.externalId}`,
    data: { type: "service", service },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-card border rounded-lg p-3 cursor-grab active:cursor-grabbing select-none hover:shadow-sm transition-shadow"
    >
      <div className="flex items-start gap-2">
        <div {...listeners} {...attributes} className="mt-0.5 text-muted-foreground hover:text-foreground">
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <ServiceTypeIcon type={service.serviceType} />
            <span className="font-medium text-sm truncate">{service.planName || service.serviceType}</span>
            {service.provider && <ProviderBadge provider={service.provider} size="xs" />}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            {service.phoneNumber && <span>{service.phoneNumber}</span>}
            {service.locationAddress && <span className="truncate max-w-[160px]">{service.locationAddress}</span>}
            {service.monthlyCost > 0 && (
              <span className="font-medium text-foreground">${service.monthlyCost.toFixed(2)}/mo</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Droppable Workbook Item ──────────────────────────────────────────────────

function DroppableWorkbookItem({
  item,
  isOver,
  linkedService,
  onUnlink,
}: {
  item: WorkbookItem;
  isOver: boolean;
  linkedService?: UnmatchedService;
  onUnlink?: () => void;
}) {
  const { setNodeRef } = useDroppable({
    id: `workbook-${item.id}`,
    data: { type: "workbook", item },
  });

  const isMatched = item.matchStatus === "matched" || !!linkedService;

  return (
    <div
      ref={setNodeRef}
      className={`border rounded-lg p-3 transition-all ${
        isMatched
          ? "border-green-300 bg-green-50/50"
          : isOver
          ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary/20"
          : "border-dashed border-muted-foreground/30 bg-muted/20 hover:border-muted-foreground/50"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm">{item.productName}</span>
            <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">{item.productType}</Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">${item.amountExGst.toFixed(2)} ex GST</span>
            {item.serviceRefId && <span>Ref: {item.serviceRefId}</span>}
          </div>
        </div>
        {isMatched && (
          <div className="flex items-center gap-1 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            {onUnlink && (
              <button onClick={onUnlink} className="text-[10px] text-muted-foreground hover:text-destructive ml-1">
                unlink
              </button>
            )}
          </div>
        )}
      </div>

      {/* Show linked service or drop hint */}
      {linkedService ? (
        <div className="mt-2 pt-2 border-t border-green-200">
          <div className="flex items-center gap-2 text-xs text-green-700">
            <Link2 className="w-3 h-3" />
            <span className="font-medium">{linkedService.planName || linkedService.serviceType}</span>
            {linkedService.provider && <ProviderBadge provider={linkedService.provider} size="xs" />}
          </div>
        </div>
      ) : !isMatched ? (
        <div className={`mt-2 pt-2 border-t border-dashed ${isOver ? "border-primary/40" : "border-muted-foreground/20"}`}>
          <p className={`text-[11px] text-center ${isOver ? "text-primary font-medium" : "text-muted-foreground"}`}>
            {isOver ? "Drop to link" : "Drag a service here to link"}
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CustomerWorkbookMatching() {
  const { customerId } = useParams<{ customerId: string }>();
  const utils = trpc.useUtils();

  const { data: customer } = trpc.billing.customers.byId.useQuery({ id: customerId! });
  const { data: unmatchedServices = [], refetch: refetchServices } =
    trpc.billing.customers.workbookMatching.unmatchedServices.useQuery(
      { customerExternalId: customerId! },
      { enabled: !!customerId }
    );
  const { data: workbookItems = [], refetch: refetchItems } =
    trpc.billing.customers.workbookMatching.workbookItems.useQuery(
      { customerExternalId: customerId! },
      { enabled: !!customerId }
    );
  const { data: fuzzyProposals = [], refetch: refetchProposals } =
    trpc.billing.customers.workbookMatching.fuzzyProposals.useQuery(
      { customerExternalId: customerId!, minScore: 40 },
      { enabled: !!customerId }
    );

  const linkMutation = trpc.billing.customers.workbookMatching.linkService.useMutation({
    onSuccess: (data, vars) => {
      toast.success(`Linked! Supplier cost updated to $${data.newCost.toFixed(2)}/mo`);
      // Optimistically remove from pending links
      setPendingLinks((prev) => {
        const next = { ...prev };
        delete next[vars.serviceExternalId];
        return next;
      });
      refetchServices();
      refetchItems();
      refetchProposals();
      utils.billing.customers.unmatchedBillingServices.invalidate({ customerExternalId: customerId! });
      utils.billing.summary.invalidate();
      utils.billing.dashboardTotals.invalidate();
    },
    onError: (err) => toast.error(`Link failed: ${err.message}`),
  });

  // Local state: pending links (serviceExternalId → workbookItemId) not yet confirmed
  const [pendingLinks, setPendingLinks] = useState<Record<string, number>>({});
  const [activeService, setActiveService] = useState<UnmatchedService | null>(null);
  const [activeOverId, setActiveOverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Build a map of workbookItemId → service for display
  const confirmedLinks: Record<number, UnmatchedService> = {};
  for (const [svcId, wbId] of Object.entries(pendingLinks)) {
    const svc = unmatchedServices.find((s) => s.externalId === svcId);
    if (svc) confirmedLinks[wbId] = svc;
  }

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const svc = (event.active.data.current as any)?.service as UnmatchedService;
    setActiveService(svc || null);
  }, []);

  const handleDragOver = useCallback((event: any) => {
    setActiveOverId(event.over?.id ?? null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveService(null);
      setActiveOverId(null);
      const { active, over } = event;
      if (!over) return;
      const svc = (active.data.current as any)?.service as UnmatchedService;
      const wbItem = (over.data.current as any)?.item as WorkbookItem;
      if (!svc || !wbItem) return;
      if (wbItem.matchStatus === "matched" && !confirmedLinks[wbItem.id]) return; // already matched elsewhere

      // Stage the link locally first
      setPendingLinks((prev) => ({ ...prev, [svc.externalId]: wbItem.id }));
    },
    [confirmedLinks]
  );

  const confirmLink = (serviceExternalId: string, workbookItemId: number) => {
    linkMutation.mutate({ serviceExternalId, workbookItemId });
  };

  const cancelLink = (serviceExternalId: string) => {
    setPendingLinks((prev) => {
      const next = { ...prev };
      delete next[serviceExternalId];
      return next;
    });
  };

  const applyFuzzyProposals = () => {
    if (fuzzyProposals.length === 0) {
      toast.info("No fuzzy match proposals found");
      return;
    }
    const newLinks: Record<string, number> = {};
    for (const p of fuzzyProposals) {
      newLinks[p.serviceExternalId] = p.workbookItemId;
    }
    setPendingLinks((prev) => ({ ...prev, ...newLinks }));
    toast.success(`${fuzzyProposals.length} auto-match proposal${fuzzyProposals.length > 1 ? "s" : ""} staged — review and confirm below`);
  };

  const confirmAllPending = () => {
    const entries = Object.entries(pendingLinks);
    if (entries.length === 0) return;
    for (const [svcId, wbId] of entries) {
      linkMutation.mutate({ serviceExternalId: svcId, workbookItemId: wbId });
    }
  };

  // Unmatched services not yet staged
  const stagedServiceIds = new Set(Object.keys(pendingLinks));
  const unstagedServices = unmatchedServices.filter((s) => !stagedServiceIds.has(s.externalId));
  const availableWorkbookItems = workbookItems.filter(
    (w) => w.matchStatus !== "matched" || !!confirmedLinks[w.id]
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Link href={`/customers/${customerId}`}>
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="w-4 h-4" />
              Back to Customer
            </Button>
          </Link>
          <Separator orientation="vertical" className="h-5" />
          <div>
            <h1 className="text-lg font-semibold">Workbook Matching</h1>
            <p className="text-sm text-muted-foreground">{customer?.name}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {Object.keys(pendingLinks).length > 0 && (
              <>
                <span className="text-sm text-muted-foreground">
                  {Object.keys(pendingLinks).length} staged
                </span>
                <Button size="sm" onClick={confirmAllPending} disabled={linkMutation.isPending}>
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Confirm All
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={applyFuzzyProposals}
              disabled={fuzzyProposals.length === 0}
              className="gap-1"
            >
              <Zap className="w-4 h-4" />
              Auto-Match ({fuzzyProposals.length})
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Unmatched Services</p>
              <p className="text-2xl font-bold">{unmatchedServices.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Workbook Items Available</p>
              <p className="text-2xl font-bold">{availableWorkbookItems.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Auto-Match Proposals</p>
              <p className="text-2xl font-bold text-primary">{fuzzyProposals.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Fuzzy proposals preview */}
        {fuzzyProposals.length > 0 && Object.keys(pendingLinks).length === 0 && (
          <Card className="mb-6 border-primary/20 bg-primary/5">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Auto-Match Suggestions
                <Badge variant="secondary" className="ml-auto">{fuzzyProposals.length} found</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="space-y-2 mb-3">
                {fuzzyProposals.slice(0, 5).map((p) => (
                  <div key={p.serviceExternalId} className="flex items-center gap-2 text-sm">
                    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded border ${scoreColor(p.score)}`}>
                      {p.score}%
                    </span>
                    <span className="text-muted-foreground truncate max-w-[200px]">{p.servicePlanName}</span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate max-w-[200px]">{p.workbookProductName}</span>
                    <span className="ml-auto text-muted-foreground shrink-0">${p.amountExGst.toFixed(2)}/mo</span>
                  </div>
                ))}
                {fuzzyProposals.length > 5 && (
                  <p className="text-xs text-muted-foreground">…and {fuzzyProposals.length - 5} more</p>
                )}
              </div>
              <Button size="sm" onClick={applyFuzzyProposals} className="gap-1">
                <Zap className="w-4 h-4" />
                Stage All Auto-Matches
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Staged links awaiting confirmation */}
        {Object.keys(pendingLinks).length > 0 && (
          <Card className="mb-6 border-amber-200 bg-amber-50/50">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Link2 className="w-4 h-4 text-amber-600" />
                Staged Links — Review &amp; Confirm
                <Badge variant="outline" className="ml-auto border-amber-300 text-amber-700">
                  {Object.keys(pendingLinks).length} pending
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="space-y-2">
                {Object.entries(pendingLinks).map(([svcId, wbId]) => {
                  const svc = unmatchedServices.find((s) => s.externalId === svcId);
                  const wb = workbookItems.find((w) => w.id === wbId);
                  if (!svc || !wb) return null;
                  const proposal = fuzzyProposals.find((p) => p.serviceExternalId === svcId && p.workbookItemId === wbId);
                  return (
                    <div key={svcId} className="flex items-center gap-3 text-sm bg-white rounded-md px-3 py-2 border border-amber-100">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium truncate">{svc.planName || svc.serviceType}</span>
                        {svc.provider && <span className="ml-2"><ProviderBadge provider={svc.provider} size="xs" /></span>}
                      </div>
                      <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium truncate">{wb.productName}</span>
                        <span className="text-muted-foreground ml-2">${wb.amountExGst.toFixed(2)}/mo</span>
                      </div>
                      {proposal && (
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${scoreColor(proposal.score)}`}>
                          {proposal.score}%
                        </span>
                      )}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-6 px-2 text-xs"
                          onClick={() => confirmLink(svcId, wbId)}
                          disabled={linkMutation.isPending}
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs text-muted-foreground"
                          onClick={() => cancelLink(svcId)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Drag-and-drop area */}
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-2 gap-6">
            {/* Left: Unmatched services */}
            <div>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-orange-500" />
                Unmatched Services
                <Badge variant="secondary">{unstagedServices.length}</Badge>
              </h2>
              {unstagedServices.length === 0 ? (
                <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
                  All services matched!
                </div>
              ) : (
                <div className="space-y-2">
                  {unstagedServices.map((svc) => (
                    <DraggableServiceCard
                      key={svc.externalId}
                      service={svc}
                      isDragging={activeService?.externalId === svc.externalId}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right: Workbook items */}
            <div>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-500" />
                Workbook Line Items
                <Badge variant="secondary">{availableWorkbookItems.length}</Badge>
              </h2>
              {availableWorkbookItems.length === 0 ? (
                <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
                  No unmatched workbook items available
                </div>
              ) : (
                <div className="space-y-2">
                  {availableWorkbookItems.map((item) => (
                    <DroppableWorkbookItem
                      key={item.id}
                      item={item}
                      isOver={activeOverId === `workbook-${item.id}`}
                      linkedService={confirmedLinks[item.id]}
                      onUnlink={
                        confirmedLinks[item.id]
                          ? () => {
                              const svcId = Object.entries(pendingLinks).find(([, wbId]) => wbId === item.id)?.[0];
                              if (svcId) cancelLink(svcId);
                            }
                          : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Drag overlay */}
          <DragOverlay>
            {activeService && (
              <div className="bg-card border shadow-xl rounded-lg p-3 opacity-95 w-72">
                <div className="flex items-center gap-2">
                  <ServiceTypeIcon type={activeService.serviceType} />
                  <span className="font-medium text-sm truncate">{activeService.planName || activeService.serviceType}</span>
                  {activeService.provider && <ProviderBadge provider={activeService.provider} size="xs" />}
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>

        {/* Already-matched workbook items (collapsed) */}
        {workbookItems.filter((w) => w.matchStatus === "matched" && !confirmedLinks[w.id]).length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold mb-3 text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Already Matched ({workbookItems.filter((w) => w.matchStatus === "matched" && !confirmedLinks[w.id]).length})
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {workbookItems
                .filter((w) => w.matchStatus === "matched" && !confirmedLinks[w.id])
                .map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 bg-green-50/30 border-green-100">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                    <span className="font-medium truncate">{item.productName}</span>
                    <span className="ml-auto text-muted-foreground shrink-0">${item.amountExGst.toFixed(2)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
