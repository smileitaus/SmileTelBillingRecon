/**
 * CustomerBillingMatch — Redesigned drag-and-drop service → billing item matching page.
 *
 * Layout:
 *   Left: Supplier Services grouped by Service Category (collapsible sections)
 *   Right: Xero Billing Items (droppable) + Special Buckets (Usage Holding, Prof Services, Hardware, Internal)
 *
 * Key behaviours:
 *   - 100% confidence matches auto-applied on screen load (no dialog)
 *   - Services billed in advance grouped separately from usage (billed in arrears)
 *   - Usage can be dropped into "Usage Holding" to be measured against next month
 *   - Non-recurring items can be dropped into Professional Services / Hardware Sales
 *   - Internal costs can be dropped into Internal Cost bucket
 *   - Remaining items prompt for manual drag-and-drop assignment
 */
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ProviderBadge } from "@/components/ProviderBadge";
import {
  Wifi,
  Phone,
  Smartphone,
  Package,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Ban,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Search,
  AlertCircle,
  Clock,
  Briefcase,
  HardDrive,
  Building2,
  Hash,
  Voicemail,
  Zap,
  Server,
  Activity,
  Globe,
  X,
} from "lucide-react";
import { toast } from "sonner";

// ─── Service Category Config ──────────────────────────────────────────────────
type ServiceCategoryKey =
  | "voice-licensing"
  | "voice-usage"
  | "voice-numbers"
  | "voice-features"
  | "data-mobile"
  | "data-nbn"
  | "data-enterprise"
  | "data-usage"
  | "hardware"
  | "professional-services"
  | "internal"
  | "other";

const CATEGORY_CONFIG: Record<
  ServiceCategoryKey,
  {
    label: string;
    icon: React.ReactNode;
    color: string;
    bgColor: string;
    borderColor: string;
    billingType: "advance" | "arrears" | "non-recurring";
  }
> = {
  "voice-licensing": {
    label: "Voice — Licensing",
    icon: <Phone className="w-3.5 h-3.5" />,
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    billingType: "advance",
  },
  "voice-usage": {
    label: "Voice — Usage",
    icon: <Activity className="w-3.5 h-3.5" />,
    color: "text-violet-700",
    bgColor: "bg-violet-50",
    borderColor: "border-violet-200",
    billingType: "arrears",
  },
  "voice-numbers": {
    label: "Voice — Numbers",
    icon: <Hash className="w-3.5 h-3.5" />,
    color: "text-indigo-700",
    bgColor: "bg-indigo-50",
    borderColor: "border-indigo-200",
    billingType: "advance",
  },
  "voice-features": {
    label: "Voice — Features",
    icon: <Voicemail className="w-3.5 h-3.5" />,
    color: "text-sky-700",
    bgColor: "bg-sky-50",
    borderColor: "border-sky-200",
    billingType: "advance",
  },
  "data-mobile": {
    label: "Data — Mobile",
    icon: <Smartphone className="w-3.5 h-3.5" />,
    color: "text-emerald-700",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    billingType: "advance",
  },
  "data-nbn": {
    label: "Data — NBN / Broadband",
    icon: <Wifi className="w-3.5 h-3.5" />,
    color: "text-teal-700",
    bgColor: "bg-teal-50",
    borderColor: "border-teal-200",
    billingType: "advance",
  },
  "data-enterprise": {
    label: "Data — Enterprise",
    icon: <Server className="w-3.5 h-3.5" />,
    color: "text-cyan-700",
    bgColor: "bg-cyan-50",
    borderColor: "border-cyan-200",
    billingType: "advance",
  },
  "data-usage": {
    label: "Data — Usage",
    icon: <Globe className="w-3.5 h-3.5" />,
    color: "text-green-700",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    billingType: "arrears",
  },
  hardware: {
    label: "Hardware",
    icon: <HardDrive className="w-3.5 h-3.5" />,
    color: "text-orange-700",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    billingType: "non-recurring",
  },
  "professional-services": {
    label: "Professional Services",
    icon: <Briefcase className="w-3.5 h-3.5" />,
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    billingType: "non-recurring",
  },
  internal: {
    label: "Internal (SmileTel)",
    icon: <Building2 className="w-3.5 h-3.5" />,
    color: "text-slate-700",
    bgColor: "bg-slate-50",
    borderColor: "border-slate-200",
    billingType: "advance",
  },
  other: {
    label: "Other",
    icon: <Package className="w-3.5 h-3.5" />,
    color: "text-gray-700",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
    billingType: "advance",
  },
};

const CATEGORY_ORDER: ServiceCategoryKey[] = [
  "voice-licensing",
  "voice-numbers",
  "voice-features",
  "voice-usage",
  "data-mobile",
  "data-nbn",
  "data-enterprise",
  "data-usage",
  "hardware",
  "professional-services",
  "internal",
  "other",
];

// Special assignment buckets
type SpecialBucketId =
  | "bucket:usage-holding"
  | "bucket:professional-services"
  | "bucket:hardware-sales"
  | "bucket:internal-cost";

const SPECIAL_BUCKETS: Array<{
  id: SpecialBucketId;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}> = [
  {
    id: "bucket:usage-holding",
    label: "Usage Holding (Arrears)",
    description: "Drop usage costs here — measured against next month's billing",
    icon: <Clock className="w-4 h-4" />,
    color: "text-violet-700",
    bgColor: "bg-violet-50",
    borderColor: "border-violet-300",
  },
  {
    id: "bucket:professional-services",
    label: "Professional Services",
    description: "Non-recurring setup, installation, consulting costs",
    icon: <Briefcase className="w-4 h-4" />,
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-300",
  },
  {
    id: "bucket:hardware-sales",
    label: "Hardware Sales",
    description: "Non-recurring hardware purchases and equipment",
    icon: <HardDrive className="w-4 h-4" />,
    color: "text-orange-700",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-300",
  },
  {
    id: "bucket:internal-cost",
    label: "Internal Cost (SmileTel)",
    description: "Costs absorbed by SmileTel — not billed to customer",
    icon: <Building2 className="w-4 h-4" />,
    color: "text-slate-700",
    bgColor: "bg-slate-50",
    borderColor: "border-slate-300",
  },
];

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
  serviceCategory?: string;
  description?: string;
  contractTerm?: string;
  avcId?: string;
  connectionId?: string;
  supplierAccount?: string;
  technology?: string;
  speedTier?: string;
  simSerialNumber?: string;
  deviceName?: string;
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
  category: string | null;
  matchStatus: string | null;
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

type BucketAssignment = {
  serviceExternalId: string;
  bucket: SpecialBucketId;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(n);
}

function MarginBadge({
  margin,
  marginPercent,
}: {
  margin: number;
  marginPercent: number | null;
}) {
  if (marginPercent === null)
    return (
      <span className="text-muted-foreground text-xs">No revenue</span>
    );
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
  onMarkUnbillable,
  onEscalate,
  compact = false,
}: {
  service: UnassignedService;
  isDragging?: boolean;
  onMarkUnbillable?: () => void;
  onEscalate?: () => void;
  compact?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: service.externalId,
    data: { service },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const cat = (service.serviceCategory || "other") as ServiceCategoryKey;
  const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG["other"];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-card border rounded-lg select-none transition-shadow ${
        isDragging
          ? "opacity-40"
          : "hover:shadow-md hover:border-primary/40"
      } ${compact ? "p-2" : "p-3"}`}
    >
      <div className="flex items-start gap-2">
        <div
          {...listeners}
          {...attributes}
          className="mt-0.5 text-muted-foreground cursor-grab active:cursor-grabbing shrink-0"
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cfg.color}>{cfg.icon}</span>
            <span className="font-medium text-sm">
              {service.planName || service.serviceType}
            </span>
            <ProviderBadge provider={service.provider} size="xs" />
          </div>
          {!compact && (
            <>
              {service.serviceTypeDetail &&
                service.serviceTypeDetail !== service.serviceType && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {service.serviceTypeDetail}
                  </p>
                )}
              {service.locationAddress && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {service.locationAddress}
                </p>
              )}
              {service.phoneNumber && (
                <p className="text-xs text-muted-foreground font-mono">
                  {service.phoneNumber}
                </p>
              )}
              {service.avcId && (
                <p className="text-xs text-muted-foreground font-mono">
                  AVC: {service.avcId}
                </p>
              )}
              {service.technology && (
                <p className="text-xs text-muted-foreground">
                  {service.technology}
                  {service.speedTier ? ` · ${service.speedTier}` : ""}
                </p>
              )}
              {service.simSerialNumber && (
                <p className="text-xs text-muted-foreground font-mono">
                  SIM: {service.simSerialNumber}
                </p>
              )}
              {service.contractTerm && (
                <p className="text-xs text-amber-600">{service.contractTerm}</p>
              )}
              <p className="text-xs text-muted-foreground/60 font-mono mt-0.5">
                ref: ...{service.externalId.slice(-8)}
              </p>
            </>
          )}
          <p className="text-xs font-semibold text-orange-600 mt-1">
            {fmt(service.monthlyCost)}/mo
          </p>
        </div>
        {!compact && (
          <div className="flex flex-col gap-1 shrink-0">
            {onMarkUnbillable && (
              <button
                onClick={onMarkUnbillable}
                className="w-7 h-7 flex items-center justify-center rounded border border-dashed text-muted-foreground hover:text-red-500 hover:border-red-300 transition-colors"
                title="Mark as intentionally unbilled"
              >
                <Ban className="w-3.5 h-3.5" />
              </button>
            )}
            {onEscalate && (
              <button
                onClick={onEscalate}
                className="w-7 h-7 flex items-center justify-center rounded border border-dashed text-muted-foreground hover:text-amber-500 hover:border-amber-300 transition-colors"
                title="Escalate for manual review"
              >
                <AlertCircle className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
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
  onRemoveService: (
    billingItemExternalId: string,
    serviceExternalId: string
  ) => void;
  onExpand: () => void;
  expanded: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: item.externalId });

  return (
    <div
      ref={setNodeRef}
      className={`border rounded-lg transition-all ${
        isOver
          ? "border-primary bg-primary/5 shadow-md"
          : "border-border bg-card hover:border-border/80"
      }`}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm leading-snug truncate">
              {item.description}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {item.invoiceNumber} · {item.invoiceDate}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-semibold text-sm text-emerald-700">
              {fmt(item.lineAmount)}
            </p>
            <p className="text-xs text-muted-foreground">revenue</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Cost:{" "}
              <span className="font-medium text-foreground">
                {fmt(item.totalCost)}
              </span>
            </span>
            <MarginBadge
              margin={item.margin}
              marginPercent={item.marginPercent}
            />
          </div>
          <button
            onClick={onExpand}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {item.assignedServices.length} service
            {item.assignedServices.length !== 1 ? "s" : ""}
            {expanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </button>
        </div>
        {expanded && item.assignedServices.length > 0 && (
          <div className="mt-2 space-y-1.5 pt-2 border-t border-border/50">
            {item.assignedServices.map((svc) => (
              <div
                key={svc.assignmentId}
                className="flex items-center justify-between gap-2 bg-muted/40 rounded px-2 py-1.5"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-medium truncate">
                    {svc.planName || svc.serviceType}
                  </span>
                  <ProviderBadge provider={svc.provider} size="xs" />
                  {svc.assignmentMethod === "auto" && (
                    <Badge variant="outline" className="text-xs py-0 h-4">
                      auto
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-orange-600 font-medium">
                    {fmt(svc.monthlyCost)}
                  </span>
                  <button
                    onClick={() =>
                      onRemoveService(item.externalId, svc.serviceExternalId)
                    }
                    className="text-muted-foreground hover:text-red-500 transition-colors"
                    title="Remove assignment"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {isOver && (
          <div className="mt-2 pt-2 border-t border-primary/30 text-xs text-primary font-medium text-center">
            Drop to assign
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Droppable Special Bucket ─────────────────────────────────────────────────
function DroppableSpecialBucket({
  bucket,
  isOver,
  assignedServices,
  onRemoveService,
}: {
  bucket: (typeof SPECIAL_BUCKETS)[0];
  isOver: boolean;
  assignedServices: Array<{
    externalId: string;
    planName: string;
    provider: string;
    monthlyCost: number;
  }>;
  onRemoveService: (serviceExternalId: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: bucket.id });
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      ref={setNodeRef}
      className={`border-2 border-dashed rounded-lg transition-all ${
        isOver
          ? `${bucket.borderColor} ${bucket.bgColor} shadow-md`
          : "border-border/40 hover:border-border/70"
      }`}
    >
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={bucket.color}>{bucket.icon}</span>
            <div>
              <p className={`text-xs font-semibold ${bucket.color}`}>
                {bucket.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {bucket.description}
              </p>
            </div>
          </div>
          {assignedServices.length > 0 && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Badge variant="secondary" className="text-xs">
                {assignedServices.length}
              </Badge>
              {expanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>
          )}
        </div>
        {isOver && (
          <div className={`mt-2 text-xs font-medium text-center ${bucket.color}`}>
            Drop to assign to {bucket.label}
          </div>
        )}
        {expanded && assignedServices.length > 0 && (
          <div className="mt-2 space-y-1 pt-2 border-t border-border/30">
            {assignedServices.map((svc) => (
              <div
                key={svc.externalId}
                className="flex items-center justify-between gap-2 bg-muted/40 rounded px-2 py-1"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-medium truncate">
                    {svc.planName}
                  </span>
                  <ProviderBadge provider={svc.provider} size="xs" />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-orange-600 font-medium">
                    {fmt(svc.monthlyCost)}
                  </span>
                  <button
                    onClick={() => onRemoveService(svc.externalId)}
                    className="text-muted-foreground hover:text-red-500"
                    title="Remove from bucket"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Category Group (collapsible) ─────────────────────────────────────────────
function CategoryGroup({
  categoryKey,
  services,
  activeServiceId,
  onMarkUnbillable,
  onEscalate,
}: {
  categoryKey: ServiceCategoryKey;
  services: UnassignedService[];
  activeServiceId?: string;
  onMarkUnbillable: (svc: UnassignedService) => void;
  onEscalate: (svc: UnassignedService) => void;
}) {
  const [open, setOpen] = useState(true);
  const cfg = CATEGORY_CONFIG[categoryKey];
  const totalCost = services.reduce((s, svc) => s + svc.monthlyCost, 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border ${cfg.borderColor} ${cfg.bgColor} hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-2">
          <span className={cfg.color}>{cfg.icon}</span>
          <span className={`text-xs font-semibold ${cfg.color}`}>
            {cfg.label}
          </span>
          {cfg.billingType === "arrears" && (
            <Badge
              variant="outline"
              className="text-xs border-violet-300 text-violet-600 py-0 h-4"
            >
              Arrears
            </Badge>
          )}
          {cfg.billingType === "non-recurring" && (
            <Badge
              variant="outline"
              className="text-xs border-amber-300 text-amber-600 py-0 h-4"
            >
              Non-recurring
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">
            {fmt(totalCost)}/mo
          </span>
          <Badge variant="secondary" className="text-xs">
            {services.length}
          </Badge>
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1.5 space-y-1.5 pl-1">
          {services.map((svc) => (
            <DraggableServiceCard
              key={svc.externalId}
              service={svc}
              isDragging={activeServiceId === svc.externalId}
              onMarkUnbillable={() => onMarkUnbillable(svc)}
              onEscalate={() => onEscalate(svc)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CustomerBillingMatch() {
  const { id: customerId } = useParams<{ id: string }>();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  // UI state
  const [activeService, setActiveService] = useState<UnassignedService | null>(null);
  const [overItemId, setOverItemId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [serviceSearch, setServiceSearch] = useState("");
  const [billingSearch, setBillingSearch] = useState("");

  // Dialogs
  const [showUnbillableDialog, setShowUnbillableDialog] = useState(false);
  const [unbillableTarget, setUnbillableTarget] = useState<UnassignedService | null>(null);
  const [unbillableReason, setUnbillableReason] = useState("intentionally-unbilled");
  const [unbillableNotes, setUnbillableNotes] = useState("");
  const [showEscalateDialog, setShowEscalateDialog] = useState(false);
  const [escalateTarget, setEscalateTarget] = useState<UnassignedService | null>(null);
  const [escalateNotes, setEscalateNotes] = useState("");

  // Bucket assignments (local state)
  const [bucketAssignments, setBucketAssignments] = useState<BucketAssignment[]>([]);

  // Track if auto-match has run
  const autoMatchedRef = useRef(false);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: customer } = trpc.billing.customers.byId.useQuery({ id: customerId });
  const {
    data: billingItemsRaw = [],
    refetch: refetchItems,
    isLoading: loadingItems,
  } = trpc.billing.customers.billingAssignments.billingItemsWithAssignments.useQuery({
    customerExternalId: customerId,
  });
  const {
    data: unassignedServicesRaw = [],
    refetch: refetchServices,
    isLoading: loadingServices,
  } = trpc.billing.customers.billingAssignments.unassignedServices.useQuery({
    customerExternalId: customerId,
  });
  const {
    data: unbillableServicesData = [],
    refetch: refetchUnbillable,
  } = trpc.billing.customers.billingAssignments.unbillableServices.useQuery({
    customerExternalId: customerId,
  });
  const {
    data: escalatedServicesData = [],
    refetch: refetchEscalated,
  } = trpc.billing.customers.billingAssignments.escalatedServices.useQuery({
    customerExternalId: customerId,
  });
  const { data: fuzzyProposals = [] } =
    trpc.billing.customers.billingAssignments.fuzzyProposals.useQuery({
      customerExternalId: customerId,
    });

  // ── Mutations ─────────────────────────────────────────────────────────────
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
  const escalateMutation = trpc.billing.customers.billingAssignments.escalate.useMutation({
    onSuccess: () => {
      refetchServices();
      refetchEscalated();
      setShowEscalateDialog(false);
      setEscalateTarget(null);
      setEscalateNotes("");
      toast.success("Service escalated for manual review");
    },
    onError: (err) => toast.error(`Escalation failed: ${err.message}`),
  });
  const resolveEscalationMutation = trpc.billing.customers.billingAssignments.resolveEscalation.useMutation({
    onSuccess: () => {
      refetchServices();
      refetchEscalated();
      toast.success("Escalation resolved");
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  // ── Auto-match 100% confidence proposals on load ──────────────────────────
  useEffect(() => {
    if (autoMatchedRef.current) return;
    if (!fuzzyProposals || (fuzzyProposals as FuzzyProposal[]).length === 0) return;
    if (loadingServices || loadingItems) return;

    const perfectMatches = (fuzzyProposals as FuzzyProposal[]).filter(
      (p) => p.scorePercent >= 100
    );
    if (perfectMatches.length === 0) return;

    autoMatchedRef.current = true;

    const applyMatches = async () => {
      let count = 0;
      for (const proposal of perfectMatches) {
        try {
          await assignMutation.mutateAsync({
            billingItemExternalId: proposal.billingItemExternalId,
            serviceExternalId: proposal.serviceExternalId,
            customerExternalId: customerId,
            assignmentMethod: "auto",
            assignmentBucket: "standard",
            notes: `Auto-matched on load (100% confidence)`,
          });
          count++;
        } catch {
          // silently skip already-assigned
        }
      }
      if (count > 0) {
        toast.success(
          `${count} service${count !== 1 ? "s" : ""} auto-matched (100% confidence)`
        );
      }
    };

    applyMatches();
  }, [fuzzyProposals, loadingServices, loadingItems]);

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const svc = event.active.data.current?.service as UnassignedService;
    setActiveService(svc || null);
  }, []);

  const handleDragOver = useCallback(
    (event: { over: { id: string } | null }) => {
      setOverItemId(event.over?.id || null);
    },
    []
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveService(null);
      setOverItemId(null);
      const { active, over } = event;
      if (!over) return;

      const serviceExternalId = String(active.id);
      const dropTargetId = String(over.id);

      // Check if dropped onto a special bucket
      const specialBucket = SPECIAL_BUCKETS.find((b) => b.id === dropTargetId);
      if (specialBucket) {
        setBucketAssignments((prev) => {
          const filtered = prev.filter(
            (a) => a.serviceExternalId !== serviceExternalId
          );
          return [
            ...filtered,
            { serviceExternalId, bucket: specialBucket.id },
          ];
        });
        toast.success(`Assigned to ${specialBucket.label}`);
        return;
      }

      // Otherwise assign to billing item
      assignMutation.mutate({
        billingItemExternalId: dropTargetId,
        serviceExternalId,
        customerExternalId: customerId,
        assignmentMethod: "drag-drop",
        assignmentBucket: "standard",
      });
    },
    [assignMutation, customerId]
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Derived data ──────────────────────────────────────────────────────────
  const bucketServiceIds = useMemo(
    () => new Set(bucketAssignments.map((a) => a.serviceExternalId)),
    [bucketAssignments]
  );

  const filteredServices = useMemo(() => {
    let list = (unassignedServicesRaw as UnassignedService[]).filter(
      (s) => !bucketServiceIds.has(s.externalId)
    );
    if (serviceSearch.trim()) {
      const q = serviceSearch.toLowerCase();
      list = list.filter(
        (s) =>
          (s.planName || "").toLowerCase().includes(q) ||
          (s.serviceType || "").toLowerCase().includes(q) ||
          (s.provider || "").toLowerCase().includes(q) ||
          (s.locationAddress || "").toLowerCase().includes(q) ||
          (s.phoneNumber || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [unassignedServicesRaw, serviceSearch, bucketServiceIds]);

  const groupedServices = useMemo(() => {
    const groups: Partial<Record<ServiceCategoryKey, UnassignedService[]>> = {};
    for (const svc of filteredServices) {
      const cat = (svc.serviceCategory || "other") as ServiceCategoryKey;
      if (!groups[cat]) groups[cat] = [];
      groups[cat]!.push(svc);
    }
    return groups;
  }, [filteredServices]);

  const orderedCategories = CATEGORY_ORDER.filter(
    (cat) => (groupedServices[cat]?.length ?? 0) > 0
  );

  const billingItems = useMemo(() => {
    if (!billingSearch.trim())
      return billingItemsRaw as BillingItemWithAssignments[];
    const q = billingSearch.toLowerCase();
    return (billingItemsRaw as BillingItemWithAssignments[]).filter(
      (i) =>
        i.description.toLowerCase().includes(q) ||
        i.invoiceNumber.toLowerCase().includes(q)
    );
  }, [billingItemsRaw, billingSearch]);

  // Summary stats
  const totalRevenue = (billingItemsRaw as BillingItemWithAssignments[]).reduce(
    (s, i) => s + Math.max(0, i.lineAmount),
    0
  );
  const assignedCost = (billingItemsRaw as BillingItemWithAssignments[]).reduce(
    (s, i) => s + i.totalCost,
    0
  );
  const totalSupplierCost =
    (unassignedServicesRaw as UnassignedService[]).reduce(
      (s, u) => s + u.monthlyCost,
      0
    ) + assignedCost;
  const totalMargin = totalRevenue - totalSupplierCost;
  const totalMarginPct =
    totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : null;
  const unassignedCount = (
    unassignedServicesRaw as UnassignedService[]
  ).filter((s) => !bucketServiceIds.has(s.externalId)).length;

  const isLoading = loadingItems || loadingServices;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
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
                Drag services onto billing items to assign them. Multiple
                services per item.
              </p>
            </div>
          </div>
          {/* Summary bar */}
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Xero Revenue</p>
              <p className="font-semibold text-emerald-700">
                {fmt(totalRevenue)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Supplier Cost</p>
              <p className="font-semibold text-orange-600">
                {fmt(totalSupplierCost)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Net Margin</p>
              <p
                className={`font-semibold ${
                  totalMargin >= 0 ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {fmt(totalMargin)}
                {totalMarginPct !== null &&
                  ` (${Math.round(totalMarginPct)}%)`}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Unassigned</p>
              <p
                className={`font-semibold ${
                  unassignedCount > 0 ? "text-amber-600" : "text-emerald-600"
                }`}
              >
                {unassignedCount}
              </p>
            </div>
          </div>
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
          <div
            className="max-w-[1600px] mx-auto px-4 py-4 grid grid-cols-1 lg:grid-cols-2 gap-6"
            style={{ height: "calc(100vh - 72px)" }}
          >
            {/* LEFT: Supplier Services grouped by category */}
            <div className="flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Supplier Services
                  <Badge variant="secondary">{unassignedCount} unassigned</Badge>
                </h2>
                <p className="text-xs text-muted-foreground">
                  Drag onto a billing item →
                </p>
              </div>
              <p className="text-xs text-orange-600/80 mb-2">
                These are <strong>supplier costs</strong> — what SmileTel pays
                ABB, SasBoss, Telstra, etc.
              </p>
              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search services..."
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                {unassignedCount === 0 && bucketServiceIds.size === 0 ? (
                  <div className="border rounded-lg p-8 text-center text-muted-foreground">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                    <p className="font-medium">All services assigned!</p>
                    <p className="text-xs mt-1">
                      Every active service has been linked to a billing item.
                    </p>
                  </div>
                ) : filteredServices.length === 0 && serviceSearch ? (
                  <div className="border rounded-lg p-6 text-center text-muted-foreground">
                    <Search className="w-6 h-6 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No services match your search</p>
                  </div>
                ) : (
                  orderedCategories.map((cat) => (
                    <CategoryGroup
                      key={cat}
                      categoryKey={cat}
                      services={groupedServices[cat] || []}
                      activeServiceId={activeService?.externalId}
                      onMarkUnbillable={(svc) => {
                        setUnbillableTarget(svc);
                        setShowUnbillableDialog(true);
                      }}
                      onEscalate={(svc) => {
                        setEscalateTarget(svc);
                        setShowEscalateDialog(true);
                      }}
                    />
                  ))
                )}

                {/* Intentionally Unbilled section */}
                {(
                  unbillableServicesData as Array<{
                    serviceExternalId: string;
                    serviceType: string;
                    planName: string;
                    reason: string;
                  }>
                ).length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Ban className="w-3.5 h-3.5" />
                      Intentionally Unbilled ({unbillableServicesData.length})
                    </h3>
                    <div className="space-y-1.5">
                      {(
                        unbillableServicesData as Array<{
                          serviceExternalId: string;
                          serviceType: string;
                          planName: string;
                          reason: string;
                        }>
                      ).map((u) => (
                        <div
                          key={u.serviceExternalId}
                          className="flex items-center justify-between gap-2 bg-muted/40 border border-dashed rounded-lg px-3 py-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Ban className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">
                                {u.planName || u.serviceType}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {u.reason}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              unmarkUnbillableMutation.mutate({
                                serviceExternalId: u.serviceExternalId,
                              })
                            }
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

                {/* Escalated services section */}
                {(
                  escalatedServicesData as Array<{
                    serviceExternalId: string;
                    serviceType: string;
                    planName: string;
                    reason: string;
                    escalatedBy: string;
                  }>
                ).length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Escalated for Review ({escalatedServicesData.length})
                    </h3>
                    <div className="space-y-1.5">
                      {(
                        escalatedServicesData as Array<{
                          serviceExternalId: string;
                          serviceType: string;
                          planName: string;
                          reason: string;
                          escalatedBy: string;
                        }>
                      ).map((e) => (
                        <div
                          key={e.serviceExternalId}
                          className="flex items-center justify-between gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">
                                {e.planName || e.serviceType}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {e.reason}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              resolveEscalationMutation.mutate({
                                serviceExternalId: e.serviceExternalId,
                              })
                            }
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            title="Mark as resolved"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: Xero Billing Items + Special Buckets */}
            <div className="flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  Xero Billing Items
                  <Badge variant="secondary">
                    {(billingItemsRaw as BillingItemWithAssignments[]).length}
                  </Badge>
                </h2>
                <p className="text-xs text-muted-foreground">
                  ← Drop services here
                </p>
              </div>
              <p className="text-xs text-emerald-700/80 mb-2">
                These are <strong>customer revenue</strong> — what SmileTel
                charges this customer via Xero.
              </p>
              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search billing items..."
                  value={billingSearch}
                  onChange={(e) => setBillingSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                {(billingItemsRaw as BillingItemWithAssignments[]).length ===
                0 ? (
                  <div className="border rounded-lg p-8 text-center text-muted-foreground">
                    <p className="font-medium">No billing items found</p>
                    <p className="text-xs mt-1">
                      Import Xero billing data for this customer first.
                    </p>
                  </div>
                ) : (
                  billingItems.map((item) => (
                    <DroppableBillingItem
                      key={item.externalId}
                      item={item}
                      isOver={overItemId === item.externalId}
                      onRemoveService={(billingItemExternalId, serviceExternalId) =>
                        removeMutation.mutate({
                          billingItemExternalId,
                          serviceExternalId,
                        })
                      }
                      onExpand={() => toggleExpand(item.externalId)}
                      expanded={expandedItems.has(item.externalId)}
                    />
                  ))
                )}

                {/* Special Assignment Buckets */}
                <div className="mt-4">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" />
                    Special Assignment Buckets
                  </h3>
                  <div className="space-y-2">
                    {SPECIAL_BUCKETS.map((bucket) => {
                      const assignedInBucket = bucketAssignments
                        .filter((a) => a.bucket === bucket.id)
                        .map((a) => {
                          const svc = (
                            unassignedServicesRaw as UnassignedService[]
                          ).find((s) => s.externalId === a.serviceExternalId);
                          return svc
                            ? {
                                externalId: svc.externalId,
                                planName: svc.planName || svc.serviceType,
                                provider: svc.provider,
                                monthlyCost: svc.monthlyCost,
                              }
                            : null;
                        })
                        .filter(Boolean) as Array<{
                        externalId: string;
                        planName: string;
                        provider: string;
                        monthlyCost: number;
                      }>;

                      return (
                        <DroppableSpecialBucket
                          key={bucket.id}
                          bucket={bucket}
                          isOver={overItemId === bucket.id}
                          assignedServices={assignedInBucket}
                          onRemoveService={(serviceExternalId) => {
                            setBucketAssignments((prev) =>
                              prev.filter(
                                (a) => a.serviceExternalId !== serviceExternalId
                              )
                            );
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Drag Overlay */}
          <DragOverlay>
            {activeService && (
              <div className="opacity-90 rotate-1 shadow-xl">
                <DraggableServiceCard service={activeService} compact />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Unbillable Dialog */}
      <Dialog
        open={showUnbillableDialog}
        onOpenChange={setShowUnbillableDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Service as Intentionally Unbilled</DialogTitle>
            <DialogDescription>
              This service will be excluded from unmatched billing counts.
            </DialogDescription>
          </DialogHeader>
          {unbillableTarget && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-3">
                <p className="font-medium text-sm">
                  {unbillableTarget.planName || unbillableTarget.serviceType}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Supplier cost: {fmt(unbillableTarget.monthlyCost)}/mo
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Reason</label>
                <Select
                  value={unbillableReason}
                  onValueChange={setUnbillableReason}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="intentionally-unbilled">
                      Intentionally not billed
                    </SelectItem>
                    <SelectItem value="internal-use">
                      Internal use / test service
                    </SelectItem>
                    <SelectItem value="bundled">
                      Bundled into another item
                    </SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">
                  Notes (optional)
                </label>
                <Textarea
                  className="mt-1"
                  placeholder="Add context for future reference..."
                  value={unbillableNotes}
                  onChange={(e) => setUnbillableNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowUnbillableDialog(false)}
            >
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

      {/* Escalate Dialog */}
      <Dialog open={showEscalateDialog} onOpenChange={setShowEscalateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escalate Service for Manual Review</DialogTitle>
            <DialogDescription>
              Flag this service for manual review when no matching billing item
              can be found.
            </DialogDescription>
          </DialogHeader>
          {escalateTarget && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-3">
                <p className="font-medium text-sm">
                  {escalateTarget.planName || escalateTarget.serviceType}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Supplier cost: {fmt(escalateTarget.monthlyCost)}/mo
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">
                  Notes (optional)
                </label>
                <Textarea
                  className="mt-1"
                  placeholder="Describe why this needs manual review..."
                  value={escalateNotes}
                  onChange={(e) => setEscalateNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowEscalateDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!escalateTarget) return;
                escalateMutation.mutate({
                  serviceExternalId: escalateTarget.externalId,
                  customerExternalId: customerId,
                  reason: "No matching Xero billing item found",
                  notes: escalateNotes || undefined,
                });
              }}
              disabled={escalateMutation.isPending}
            >
              {escalateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <AlertCircle className="w-4 h-4 mr-2" />
              )}
              Escalate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
