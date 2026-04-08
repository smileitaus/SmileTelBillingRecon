/**
 * ReconciliationBoard — Unified billing reconciliation component
 *
 * Replaces the separate "Unmatched Billing" flat list and the CustomerBillingMatch screen.
 * Provides a single integrated view with:
 *  - Billing type tabs: Services (Advance) | Usage (Arrears) | Non-Recurring | Internal/Parked
 *  - Category-grouped supplier service cards (draggable)
 *  - Xero revenue drop targets with live margin calculations
 *  - Special assignment buckets: Usage Holding, Professional Services, Hardware Sales, Internal Cost
 *  - 100% confidence auto-match on mount
 *  - Drag-and-drop assignment
 */

import { useState, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Phone, Wifi, Smartphone, Globe, Package, Briefcase, Building2,
  Clock, ChevronDown, ChevronRight, GripVertical, X, CheckCircle2,
  Zap, TrendingUp, TrendingDown, AlertTriangle, Archive, Loader2,
  RefreshCw, DollarSign, ArrowRight, Info, Inbox, Wand2, AlertCircle, ShieldOff,
  HardDrive, Headphones, Box, MapPinOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProviderBadge } from "@/components/ProviderBadge";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type BillingType = "advance" | "arrears" | "non-recurring" | "internal";

type ServiceCategory =
  | "voice-licensing" | "voice-usage" | "voice-numbers" | "voice-features"
  | "data-mobile" | "data-nbn" | "data-enterprise" | "data-usage"
  | "hardware" | "professional-services" | "internal" | "other";

type AssignmentBucket =
  | "standard" | "usage-holding" | "professional-services" | "hardware-sales" | "internal-cost";

interface UnassignedService {
  externalId: string;
  serviceType: string;
  serviceTypeDetail: string;
  planName: string;
  monthlyCost: number;
  provider: string;
  locationAddress: string;
  phoneNumber: string;
  status: string;
  serviceCategory: string;
  avcId?: string;
  connectionId?: string;
  simSerialNumber?: string;
  deviceName?: string;
  billingPlatform?: string | null;
}

interface AssignedService {
  assignmentId: number;
  serviceExternalId: string;
  serviceType: string;
  serviceTypeDetail: string;
  planName: string;
  monthlyCost: number;
  provider: string;
  locationAddress: string;
  phoneNumber: string;
  avcId: string;
  serviceCategory: string;
  assignedBy: string;
  assignmentMethod: string;
}

interface BillingItemWithAssignments {
  externalId: string;
  invoiceDate: string;
  invoiceNumber: string;
  description: string;
  lineAmount: number;
  category: string;
  matchStatus: string;
  billingPlatform?: string;
  matchConfidence?: string;
  assignedServices: AssignedService[];
  totalCost: number;
  supplierServicesCost: number;
  bundleFixedCostTotal: number;
  bundleFixedCostInputs: Array<{ slotType: string; monthlyCostExGst: number; costSource: string }>;
  margin: number;
  marginPercent: number | null;
}

interface FuzzyProposal {
  serviceExternalId: string;
  billingItemExternalId: string;
  score: number;
  scorePercent: number;
  servicePlanName: string;
  serviceType: string;
  billingDescription: string;
}

// ─── Category Config ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<ServiceCategory, {
  label: string;
  icon: React.ReactNode;
  billingType: BillingType;
  color: string;
}> = {
  "voice-licensing": { label: "Voice — Licensing", icon: <Phone className="w-3.5 h-3.5" />, billingType: "advance", color: "text-blue-600" },
  "voice-usage":     { label: "Voice — Usage",     icon: <Phone className="w-3.5 h-3.5" />, billingType: "arrears", color: "text-purple-600" },
  "voice-numbers":   { label: "Voice — Numbers",   icon: <Phone className="w-3.5 h-3.5" />, billingType: "advance", color: "text-blue-500" },
  "voice-features":  { label: "Voice — Features",  icon: <Phone className="w-3.5 h-3.5" />, billingType: "advance", color: "text-blue-400" },
  "data-mobile":     { label: "Data — Mobile",     icon: <Smartphone className="w-3.5 h-3.5" />, billingType: "advance", color: "text-green-600" },
  "data-nbn":        { label: "Data — NBN/Broadband", icon: <Wifi className="w-3.5 h-3.5" />, billingType: "advance", color: "text-teal-600" },
  "data-enterprise": { label: "Data — Enterprise", icon: <Wifi className="w-3.5 h-3.5" />, billingType: "advance", color: "text-teal-700" },
  "data-usage":      { label: "Data — Usage",      icon: <Wifi className="w-3.5 h-3.5" />, billingType: "arrears", color: "text-orange-600" },
  "hardware":        { label: "Hardware",           icon: <Package className="w-3.5 h-3.5" />, billingType: "non-recurring", color: "text-amber-600" },
  "professional-services": { label: "Professional Services", icon: <Briefcase className="w-3.5 h-3.5" />, billingType: "non-recurring", color: "text-indigo-600" },
  "internal":        { label: "Internal (SmileTel)", icon: <Building2 className="w-3.5 h-3.5" />, billingType: "internal", color: "text-gray-500" },
  "other":           { label: "Other",              icon: <Globe className="w-3.5 h-3.5" />, billingType: "advance", color: "text-gray-600" },
};

const BILLING_TYPE_TABS: { id: BillingType; label: string; description: string; icon: React.ReactNode }[] = [
  { id: "advance",       label: "Services (Advance)",  description: "Recurring services billed in advance",        icon: <Zap className="w-3.5 h-3.5" /> },
  { id: "arrears",       label: "Usage (Arrears)",     description: "Usage charges billed in arrears",             icon: <Clock className="w-3.5 h-3.5" /> },
  { id: "non-recurring", label: "Non-Recurring",       description: "One-off hardware and professional services",  icon: <Package className="w-3.5 h-3.5" /> },
  { id: "internal",      label: "Internal / Parked",   description: "Internal costs and parked items",             icon: <Archive className="w-3.5 h-3.5" /> },
];

const SPECIAL_BUCKETS: { id: AssignmentBucket; label: string; description: string; icon: React.ReactNode; color: string }[] = [
  { id: "usage-holding",        label: "Usage Holding",       description: "Usage costs held for next month's billing", icon: <Clock className="w-3.5 h-3.5" />,      color: "border-purple-300 bg-purple-50" },
  { id: "professional-services",label: "Professional Services",description: "One-off setup, consulting, installation",   icon: <Briefcase className="w-3.5 h-3.5" />, color: "border-indigo-300 bg-indigo-50" },
  { id: "hardware-sales",       label: "Hardware Sales",      description: "One-off hardware purchases",                icon: <Package className="w-3.5 h-3.5" />,    color: "border-amber-300 bg-amber-50" },
  { id: "internal-cost",        label: "Internal Cost",       description: "Costs absorbed by SmileTel internally",     icon: <Building2 className="w-3.5 h-3.5" />,  color: "border-gray-300 bg-gray-50" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBillingTypeForCategory(cat: string): BillingType {
  const cfg = CATEGORY_CONFIG[cat as ServiceCategory];
  return cfg?.billingType ?? "advance";
}

function fmt(n: number) {
  return n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Known billing platforms for the quick-assign dropdown
const BILLING_PLATFORMS = ['OneBill', 'SasBoss', 'ECN', 'Halo', 'DataGate', 'TIAB', 'Vocus', 'ABB', 'Telstra', 'Other'];

// ─── Service Card (draggable) ─────────────────────────────────────────────────

function ServiceCard({
  service,
  isDragging,
  onDragStart,
  onDragEnd,
  onAssignBillingPlatform,
}: {
  service: UnassignedService;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, service: UnassignedService) => void;
  onDragEnd: () => void;
  onAssignBillingPlatform?: (serviceExternalId: string, platform: string) => void;
}) {
  const cfg = CATEGORY_CONFIG[service.serviceCategory as ServiceCategory];
  const billingType = getBillingTypeForCategory(service.serviceCategory);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, service)}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative bg-white border border-border rounded-lg px-3 py-2.5 cursor-grab active:cursor-grabbing transition-all select-none",
        "hover:border-orange-300 hover:shadow-sm",
        isDragging && "opacity-40 scale-95 border-orange-400 shadow-lg"
      )}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 mt-0.5 shrink-0 group-hover:text-muted-foreground/70" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn("shrink-0", cfg?.color ?? "text-gray-500")}>{cfg?.icon}</span>
            <span className="text-sm font-medium truncate">{service.serviceTypeDetail || service.serviceType}</span>
            <ProviderBadge provider={service.provider} size="xs" />
          </div>
          {service.planName && service.planName !== service.serviceTypeDetail && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{service.planName}</p>
          )}
          {service.locationAddress && service.locationAddress !== 'Unknown Location' ? (
            <p className="text-xs text-muted-foreground/70 truncate">{service.locationAddress}</p>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full mt-0.5">
              <MapPinOff className="w-2.5 h-2.5" />
              No location
            </span>
          )}
          {(service.phoneNumber || service.simSerialNumber) && (
            <p className="text-xs text-muted-foreground/70 truncate">{service.phoneNumber || service.simSerialNumber}</p>
          )}
          {/* Billing platform quick-assign */}
          {!service.billingPlatform && onAssignBillingPlatform && (
            <div
              className="mt-1"
              onMouseDown={(e) => e.stopPropagation()}
              onDragStart={(e) => e.preventDefault()}
            >
              <select
                className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 cursor-pointer hover:bg-amber-100 transition-colors w-full"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) onAssignBillingPlatform(service.externalId, e.target.value);
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="" disabled>⚠ No billing platform — assign</option>
                {BILLING_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
          {service.billingPlatform && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full mt-0.5">
              {service.billingPlatform}
            </span>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("text-sm font-semibold", service.monthlyCost > 0 ? "text-orange-600" : "text-rose-500")}>
            {service.monthlyCost > 0 ? `$${fmt(service.monthlyCost)}/mo` : (
              <span className="flex items-center gap-0.5 justify-end">
                <AlertCircle className="w-3 h-3" />
                $0.00
              </span>
            )}
          </p>
          <span className={cn(
            "inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full mt-0.5",
            billingType === "advance"       && "bg-blue-50 text-blue-700",
            billingType === "arrears"       && "bg-purple-50 text-purple-700",
            billingType === "non-recurring" && "bg-amber-50 text-amber-700",
            billingType === "internal"      && "bg-gray-100 text-gray-600",
          )}>
            {billingType === "arrears" && <Clock className="w-2.5 h-2.5" />}
            {billingType === "advance" ? "ADV" : billingType === "arrears" ? "ARR" : billingType === "non-recurring" ? "1×" : "INT"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Assigned Service Card (expandable, inside billing item) ────────────────

function AssignedServiceCard({
  svc,
  onRemove,
}: {
  svc: AssignedService;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = CATEGORY_CONFIG[svc.serviceCategory as ServiceCategory];
  const billingType = getBillingTypeForCategory(svc.serviceCategory);

  return (
    <div className="rounded-md border border-teal-200 bg-white overflow-hidden">
      {/* Collapsed row */}
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-teal-50/50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <ProviderBadge provider={svc.provider} size="xs" />
        <span className={cn("shrink-0", cfg?.color ?? "text-gray-500")}>{cfg?.icon}</span>
        <span className="flex-1 text-xs font-medium truncate">{svc.serviceTypeDetail || svc.planName || svc.serviceType}</span>
        <span className={cn("text-xs font-semibold shrink-0", svc.monthlyCost > 0 ? "text-orange-600" : "text-rose-500 flex items-center gap-0.5")}>
          {svc.monthlyCost > 0 ? `$${fmt(svc.monthlyCost)}/mo` : (
            <><AlertCircle className="w-3 h-3" />$0.00</>
          )}
        </span>
        <span className={cn(
          "inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0",
          billingType === "advance"       && "bg-blue-50 text-blue-700",
          billingType === "arrears"       && "bg-purple-50 text-purple-700",
          billingType === "non-recurring" && "bg-amber-50 text-amber-700",
          billingType === "internal"      && "bg-gray-100 text-gray-600",
        )}>
          {billingType === "arrears" && <Clock className="w-2.5 h-2.5" />}
          {billingType === "advance" ? "ADV" : billingType === "arrears" ? "ARR" : billingType === "non-recurring" ? "1\u00d7" : "INT"}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          title="Unlink service"
          className="ml-0.5 text-teal-300 hover:text-rose-500 transition-colors shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
        {expanded
          ? <ChevronDown className="w-3 h-3 text-muted-foreground/50 shrink-0" />
          : <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-teal-100 bg-teal-50/30 px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {svc.planName && (
            <>
              <span className="text-muted-foreground">Plan</span>
              <span className="font-medium truncate">{svc.planName}</span>
            </>
          )}
          {svc.serviceTypeDetail && svc.serviceTypeDetail !== svc.planName && (
            <>
              <span className="text-muted-foreground">Type Detail</span>
              <span className="font-medium truncate">{svc.serviceTypeDetail}</span>
            </>
          )}
          {svc.locationAddress && (
            <>
              <span className="text-muted-foreground">Location</span>
              <span className="font-medium truncate">{svc.locationAddress}</span>
            </>
          )}
          {svc.phoneNumber && (
            <>
              <span className="text-muted-foreground">Phone / SIM</span>
              <span className="font-medium">{svc.phoneNumber}</span>
            </>
          )}
          {svc.avcId && (
            <>
              <span className="text-muted-foreground">AVC ID</span>
              <span className="font-medium font-mono text-[10px]">{svc.avcId}</span>
            </>
          )}
          <span className="text-muted-foreground">Assigned by</span>
          <span className="font-medium capitalize">{svc.assignedBy || 'auto'}</span>
          <span className="text-muted-foreground">Method</span>
          <span className="font-medium capitalize">{svc.assignmentMethod || '—'}</span>
          <span className="text-muted-foreground">Supplier Ref</span>
          <span className="font-mono text-[10px] text-muted-foreground truncate">{svc.serviceExternalId}</span>
        </div>
      )}
    </div>
  );
}

// ─── Xero Billing Item Drop Target ───────────────────────────────────────────

function BillingItemDropTarget({
  item,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onRemoveAssignment,
}: {
  item: BillingItemWithAssignments;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, billingItemExternalId: string) => void;
  onRemoveAssignment: (billingItemExternalId: string, serviceExternalId: string) => void;
}) {
  const hasAssignments = item.assignedServices.length > 0;
  const marginPositive = item.margin >= 0;

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, item.externalId)}
      className={cn(
        "rounded-lg border-2 transition-all",
        isDragOver
          ? "border-orange-400 bg-orange-50 shadow-md scale-[1.01]"
          : hasAssignments
          ? "border-teal-200 bg-teal-50/30"
          : "border-dashed border-border bg-muted/20 hover:border-orange-300 hover:bg-orange-50/20"
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.description}</p>
          <p className="text-xs text-muted-foreground">
            {item.invoiceNumber} · {item.invoiceDate?.slice(0, 10)}
            {item.billingPlatform && (
              <span className={`ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                item.billingPlatform === 'DataGate' ? 'bg-sky-100 text-sky-700 border border-sky-200' :
                item.billingPlatform === 'Xero' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                item.billingPlatform === 'SasBoss' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                item.billingPlatform === 'ChannelHaus' ? 'bg-violet-100 text-violet-700 border border-violet-200' :
                'bg-gray-100 text-gray-600 border border-gray-200'
              }`}>
                {item.billingPlatform}
                {item.matchConfidence && item.matchConfidence !== 'high' && (
                  <span className="ml-1 opacity-60">({item.matchConfidence})</span>
                )}
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-teal-700">${fmt(item.lineAmount)}</p>
          <p className="text-[10px] text-muted-foreground">revenue</p>
        </div>
      </div>

      {/* Margin row */}
      {hasAssignments && (
        <div className="flex items-center gap-3 px-3 pb-2 text-xs">
          <span className="text-muted-foreground">
            Cost: <span className="font-medium text-orange-600">${fmt(item.totalCost)}</span>
            {item.bundleFixedCostTotal > 0 && (
              <span className="ml-1 text-[10px] text-violet-600 font-normal">
                ({fmt(item.supplierServicesCost ?? (item.totalCost - item.bundleFixedCostTotal))} svcs + {fmt(item.bundleFixedCostTotal)} bundle)
              </span>
            )}
          </span>
          <span className={cn("flex items-center gap-0.5 font-semibold", marginPositive ? "text-teal-700" : "text-rose-600")}>
            {marginPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {marginPositive ? "+" : ""}${fmt(item.margin)}
            {item.marginPercent !== null && ` (${Math.round(item.marginPercent)}%)`}
          </span>
        </div>
      )}

      {/* Bundle fixed cost rows — always visible so margin is transparent */}
      {item.bundleFixedCostInputs && item.bundleFixedCostInputs.length > 0 && (
        <div className="px-3 pb-2 space-y-1.5">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="flex-1 h-px bg-violet-200/60" />
            <span className="text-[10px] text-violet-500 font-medium uppercase tracking-wider">Bundle Fixed Costs</span>
            <div className="flex-1 h-px bg-violet-200/60" />
          </div>
          {item.bundleFixedCostInputs.map((bc, idx) => {
            const slotIcons: Record<string, React.ReactNode> = {
              hardware:    <HardDrive className="w-3 h-3 text-orange-500" />,
              sip_channel: <Phone className="w-3 h-3 text-green-500" />,
              support:     <Headphones className="w-3 h-3 text-cyan-500" />,
              internet:    <Wifi className="w-3 h-3 text-blue-500" />,
              sim_4g:      <Smartphone className="w-3 h-3 text-purple-500" />,
              other:       <Box className="w-3 h-3 text-gray-400" />,
            };
            const slotLabels: Record<string, string> = {
              hardware:    'Hardware Rental',
              sip_channel: 'SIP Channel',
              support:     'Support',
              internet:    'Internet (NBN)',
              sim_4g:      '4G SIM',
              other:       'Other',
            };
            return (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 bg-violet-50/60 border border-violet-100 rounded px-2 py-1.5"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {slotIcons[bc.slotType] ?? <Box className="w-3 h-3 text-gray-400" />}
                  <span className="text-xs font-medium text-violet-800 truncate">
                    {slotLabels[bc.slotType] ?? bc.slotType}
                  </span>
                  <span className="inline-flex items-center px-1 py-0 rounded text-[10px] font-medium bg-violet-100 text-violet-600 border border-violet-200">
                    bundle
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-orange-600 font-medium">
                    ${fmt(bc.monthlyCostExGst)}/mo
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assigned services — expandable cards */}
      {hasAssignments && (
        <div className="px-3 pb-2.5 flex flex-col gap-1.5">
          {item.assignedServices.map((svc) => (
            <AssignedServiceCard
              key={svc.serviceExternalId}
              svc={svc}
              onRemove={() => onRemoveAssignment(item.externalId, svc.serviceExternalId)}
            />
          ))}
        </div>
      )}

      {/* Empty drop hint */}
      {!hasAssignments && (
        <div className={cn(
          "flex items-center justify-center gap-2 px-3 pb-3 text-xs",
          isDragOver ? "text-orange-600" : "text-muted-foreground/50"
        )}>
          <ArrowRight className="w-3 h-3" />
          {isDragOver ? "Drop to assign" : "Drop a service here"}
        </div>
      )}
    </div>
  );
}

// ─── Special Bucket Drop Target ───────────────────────────────────────────────

function BucketDropTarget({
  bucket,
  isDragOver,
  assignedCount,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  bucket: typeof SPECIAL_BUCKETS[0];
  isDragOver: boolean;
  assignedCount: number;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, bucketId: AssignmentBucket) => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, bucket.id)}
      className={cn(
        "rounded-lg border-2 border-dashed px-3 py-3 transition-all",
        bucket.color,
        isDragOver && "scale-[1.02] shadow-md border-solid opacity-90"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{bucket.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold">{bucket.label}</p>
          <p className="text-[10px] text-muted-foreground">{bucket.description}</p>
        </div>
        {assignedCount > 0 && (
          <span className="text-[10px] font-bold bg-white/80 rounded-full px-1.5 py-0.5 border border-current">
            {assignedCount}
          </span>
        )}
      </div>
      {isDragOver && (
        <p className="text-xs text-center mt-2 font-medium">Drop here to assign</p>
      )}
    </div>
  );
}

// ─── Category Group ───────────────────────────────────────────────────────────

function CategoryGroup({
  category,
  services,
  dragState,
  onDragStart,
  onDragEnd,
  onAssignBillingPlatform,
}: {
  category: ServiceCategory;
  services: UnassignedService[];
  dragState: { draggingId: string | null };
  onDragStart: (e: React.DragEvent, service: UnassignedService) => void;
  onDragEnd: () => void;
  onAssignBillingPlatform?: (serviceExternalId: string, platform: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const cfg = CATEGORY_CONFIG[category];
  const totalCost = services.reduce((sum, s) => sum + s.monthlyCost, 0);

  return (
    <div className="mb-2">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors text-left"
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        <span className={cn("shrink-0", cfg?.color)}>{cfg?.icon}</span>
        <span className="text-xs font-semibold flex-1">{cfg?.label ?? category}</span>
        <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">{services.length}</span>
        <span className="text-[10px] font-semibold text-orange-600">${fmt(totalCost)}/mo</span>
      </button>
      {!collapsed && (
        <div className="space-y-1.5 mt-1 pl-2">
          {services.map((svc) => (
            <ServiceCard
              key={svc.externalId}
              service={svc}
              isDragging={dragState.draggingId === svc.externalId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onAssignBillingPlatform={onAssignBillingPlatform}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ReconciliationBoard({ customerExternalId }: { customerExternalId: string }) {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<BillingType>("advance");
  const [dragState, setDragState] = useState<{ draggingId: string | null; draggingService: UnassignedService | null }>({
    draggingId: null,
    draggingService: null,
  });
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  // Track bucket assignments locally (bucket → service externalIds)
  const [bucketAssignments, setBucketAssignments] = useState<Record<AssignmentBucket, string[]>>({
    "standard": [],
    "usage-holding": [],
    "professional-services": [],
    "hardware-sales": [],
    "internal-cost": [],
  });
  const [autoMatchRan, setAutoMatchRan] = useState(false);
  const [autoMatchRunning, setAutoMatchRunning] = useState(false);
  const [syncingCosts, setSyncingCosts] = useState(false);

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: unassignedServices = [], isLoading: loadingServices, refetch: refetchServices } =
    trpc.billing.customers.billingAssignments.unassignedServices.useQuery(
      { customerExternalId },
      { enabled: !!customerExternalId, staleTime: 10_000 }
    );

  const { data: billingItems = [], isLoading: loadingItems, refetch: refetchItems } =
    trpc.billing.customers.billingAssignments.billingItemsWithAssignments.useQuery(
      { customerExternalId },
      { enabled: !!customerExternalId, staleTime: 10_000 }
    );

  const { data: fuzzyProposals = [], isLoading: loadingProposals } =
    trpc.billing.customers.billingAssignments.fuzzyProposals.useQuery(
      { customerExternalId },
      { enabled: !!customerExternalId, staleTime: 30_000 }
    );

  // Outage-suppressed services: unbilled services hidden from the leakage list due to active outage
  const { data: suppressedServices = [] } =
    trpc.billing.customers.suppressedUnbilledServices.useQuery(
      { customerExternalId },
      { enabled: !!customerExternalId, staleTime: 60_000 }
    );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const assignMutation = trpc.billing.customers.billingAssignments.assign.useMutation({
    onSuccess: () => {
      refetchServices();
      refetchItems();
      utils.billing.customers.byId.invalidate();
      utils.billing.customers.unmatchedBillingServices.invalidate();
      utils.billing.summary.invalidate();
    },
    onError: (err) => toast.error(`Assignment failed: ${err.message}`),
  });

  const removeAssignmentMutation = trpc.billing.customers.billingAssignments.removeAssignment.useMutation({
    onSuccess: () => {
      refetchServices();
      refetchItems();
      utils.billing.customers.byId.invalidate();
      utils.billing.customers.unmatchedBillingServices.invalidate();
    },
    onError: (err) => toast.error(`Failed to remove: ${err.message}`),
  });

  const markUnbillableMutation = trpc.billing.customers.billingAssignments.markUnbillable.useMutation({
    onSuccess: () => {
      refetchServices();
      utils.billing.customers.byId.invalidate();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const updateServiceMutation = trpc.billing.services.update.useMutation({
    onSuccess: () => {
      refetchServices();
      toast.success('Billing platform updated');
    },
    onError: (err) => toast.error(`Failed to update: ${err.message}`),
  });

  const handleAssignBillingPlatform = useCallback((serviceExternalId: string, platform: string) => {
    updateServiceMutation.mutate({
      serviceExternalId,
      updates: { billingPlatform: [platform] },
    });
  }, [updateServiceMutation]);

  const syncCostsMutation = trpc.billing.recalculateCosts.useMutation({
    onSuccess: (result) => {
      setSyncingCosts(false);
      if (result.updated > 0) {
        toast.success(`Updated costs for ${result.updated} service${result.updated !== 1 ? 's' : ''} from workbook`);
        refetchServices();
        refetchItems();
      } else {
        toast.info('No cost updates found in workbook — costs may need to be re-imported');
      }
    },
    onError: (err) => {
      setSyncingCosts(false);
      toast.error(`Cost sync failed: ${err.message}`);
    },
  });

  // ── Auto-match on mount ───────────────────────────────────────────────────
  const runAutoMatch = useCallback(async (proposals: FuzzyProposal[], threshold = 90) => {
    const highConfidence = proposals.filter(p => p.scorePercent >= threshold);
    if (highConfidence.length === 0) return 0;
    setAutoMatchRunning(true);
    let applied = 0;
    for (const p of highConfidence) {
      try {
        await assignMutation.mutateAsync({
          billingItemExternalId: p.billingItemExternalId,
          serviceExternalId: p.serviceExternalId,
          customerExternalId,
          assignmentMethod: "auto",
          assignmentBucket: "standard",
        });
        applied++;
      } catch {
        // silently skip failed auto-matches (e.g. already assigned)
      }
    }
    setAutoMatchRunning(false);
    if (applied > 0) {
      refetchServices();
      refetchItems();
      utils.billing.customers.byId.invalidate();
      utils.billing.customers.unmatchedBillingServices.invalidate();
    }
    return applied;
  }, [assignMutation, customerExternalId, refetchServices, refetchItems, utils]);

  useEffect(() => {
    if (autoMatchRan || loadingProposals || loadingItems || loadingServices) return;
    if (fuzzyProposals.length === 0) { setAutoMatchRan(true); return; }
    // Mark as ran immediately to prevent double-firing
    setAutoMatchRan(true);
    // Run all high-confidence matches (>=90%) automatically on mount
    runAutoMatch(fuzzyProposals as FuzzyProposal[], 90).then(applied => {
      if (applied > 0) {
        toast.success(`Auto-matched ${applied} service${applied !== 1 ? 's' : ''} at ≥90% confidence`);
      }
    });
  }, [fuzzyProposals, loadingProposals, loadingItems, loadingServices, autoMatchRan, runAutoMatch]);

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, service: UnassignedService) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("serviceExternalId", service.externalId);
    setDragState({ draggingId: service.externalId, draggingService: service });
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragState({ draggingId: null, draggingService: null });
    setDragOverTarget(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverTarget(targetId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverTarget(null);
  }, []);

  const handleDropOnBillingItem = useCallback((e: React.DragEvent, billingItemExternalId: string) => {
    e.preventDefault();
    setDragOverTarget(null);
    const serviceId = e.dataTransfer.getData("serviceExternalId");
    if (!serviceId) return;
    assignMutation.mutate({
      billingItemExternalId,
      serviceExternalId: serviceId,
      customerExternalId,
      assignmentMethod: "drag-drop",
      assignmentBucket: "standard",
    });
    toast.success("Service assigned to billing item");
  }, [customerExternalId, assignMutation]);

  const handleDropOnBucket = useCallback((e: React.DragEvent, bucketId: AssignmentBucket) => {
    e.preventDefault();
    setDragOverTarget(null);
    const serviceId = e.dataTransfer.getData("serviceExternalId");
    if (!serviceId) return;

    // For usage-holding and internal-cost, mark as unbillable with reason
    if (bucketId === "internal-cost") {
      markUnbillableMutation.mutate({
        serviceExternalId: serviceId,
        customerExternalId,
        reason: "internal-cost",
        notes: "Assigned to Internal Cost bucket",
      });
      toast.success("Assigned to Internal Cost");
      return;
    }

    // For other buckets, we need a billing item — use the first matching one or create a virtual assignment
    // For now, track locally and show in bucket
    setBucketAssignments(prev => ({
      ...prev,
      [bucketId]: [...(prev[bucketId] || []), serviceId],
    }));
    toast.success(`Assigned to ${SPECIAL_BUCKETS.find(b => b.id === bucketId)?.label}`);
  }, [customerExternalId, markUnbillableMutation]);

  const handleRemoveAssignment = useCallback((billingItemExternalId: string, serviceExternalId: string) => {
    removeAssignmentMutation.mutate({ billingItemExternalId, serviceExternalId });
  }, [removeAssignmentMutation]);

  // ── Derived data ──────────────────────────────────────────────────────────
  // Group unassigned services by category, filtered by active tab billing type
  const bucketedServiceIds = new Set(Object.values(bucketAssignments).flat());
  const displayServices = (unassignedServices as UnassignedService[]).filter(
    s => !bucketedServiceIds.has(s.externalId)
  );

  const servicesByCategory = displayServices.reduce((acc, svc) => {
    const cat = (svc.serviceCategory || "other") as ServiceCategory;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(svc);
    return acc;
  }, {} as Record<ServiceCategory, UnassignedService[]>);

  const categoriesForTab = (Object.keys(servicesByCategory) as ServiceCategory[]).filter(
    cat => CATEGORY_CONFIG[cat]?.billingType === activeTab
  );

  // Classify a billing item description into a billing type
  // Since all Xero billing items have category='recurring', we use description-based heuristics
  function classifyBillingItemType(item: BillingItemWithAssignments): BillingType {
    const desc = (item.description || '').toLowerCase();
    const cat = (item.category || '').toLowerCase();
    // Non-recurring: hardware, one-off, setup, installation, professional services
    if (desc.match(/hardware|handset|device|router|modem|equipment|one.off|setup fee|installation|professional service|consulting|labour/)) return 'non-recurring';
    if (cat.includes('hardware') || cat.includes('professional') || cat.includes('one-off')) return 'non-recurring';
    // Arrears: usage, calls, data usage, excess
    if (desc.match(/usage|calls|excess|overage|arrears|per.*call|call.*charge|miscellaneous call/)) return 'arrears';
    if (cat.includes('usage') || cat.includes('arrears')) return 'arrears';
    // Internal: internal, parked, absorbed
    if (desc.match(/internal|parked|absorbed|smiletel/)) return 'internal';
    if (cat.includes('internal')) return 'internal';
    // Default: advance (recurring services)
    return 'advance';
  }

  // Billing items for the active tab
  const billingItemsForTab = (billingItems as BillingItemWithAssignments[]).filter(item => {
    return classifyBillingItemType(item) === activeTab;
  });

  // For the advance tab, if no items match the heuristic, show all items (fallback)
  const showAllBillingItems = billingItemsForTab.length === 0 && activeTab === "advance";
  const displayBillingItems = showAllBillingItems ? (billingItems as BillingItemWithAssignments[]) : billingItemsForTab;

  // Summary counts
  const totalUnassigned = displayServices.length;
  const totalAssigned = (billingItems as BillingItemWithAssignments[]).reduce((sum, i) => sum + i.assignedServices.length, 0);
  const totalRevenue = (billingItems as BillingItemWithAssignments[]).reduce((sum, i) => sum + i.lineAmount, 0);
  const totalCost = (billingItems as BillingItemWithAssignments[]).reduce((sum, i) => sum + i.totalCost, 0);
  const netMargin = totalRevenue - totalCost;
  const zeroCostServices = (unassignedServices as UnassignedService[]).filter(s => s.monthlyCost === 0).length;

  const isLoading = loadingServices || loadingItems;

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
        <span className="text-sm text-muted-foreground">Loading reconciliation board...</span>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {/* Board Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <DollarSign className="w-3.5 h-3.5" />
            Reconciliation Board
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Drag supplier services onto Xero billing items to assign them. Auto-matched 100% confident pairs on load.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Summary pills */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">Revenue: <span className="font-semibold text-teal-700">${fmt(totalRevenue)}</span></span>
            <span className="text-muted-foreground">Cost: <span className="font-semibold text-orange-600">${fmt(totalCost)}</span></span>
            <span className={cn("font-semibold flex items-center gap-0.5", netMargin >= 0 ? "text-teal-700" : "text-rose-600")}>
              {netMargin >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              Margin: {netMargin >= 0 ? "+" : ""}${fmt(netMargin)}
            </span>
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 text-orange-700 border-orange-200 hover:bg-orange-50"
              onClick={() => {
                setSyncingCosts(true);
                syncCostsMutation.mutate({ customerExternalId });
              }}
              disabled={syncingCosts}
              title="Re-apply costs from the most recent SasBoss workbook upload"
            >
              {syncingCosts ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Sync Costs
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50"
              onClick={() => {
                if (fuzzyProposals.length === 0) {
                  toast.info('No proposals available — all services may already be assigned');
                  return;
                }
                runAutoMatch(fuzzyProposals as FuzzyProposal[], 90).then(applied => {
                  if (applied > 0) {
                    toast.success(`Auto-matched ${applied} service${applied !== 1 ? 's' : ''} at ≥90% confidence`);
                  } else {
                    toast.info('No new matches found — remaining services need manual assignment');
                  }
                });
              }}
              disabled={autoMatchRunning || loadingProposals}
              title="Re-run auto-match for high-confidence pairs"
            >
              {autoMatchRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              Auto-Match
            </Button>
          </div>
          {totalUnassigned > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
              <AlertTriangle className="w-3 h-3" />
              {totalUnassigned} unassigned
            </span>
          )}
          {totalUnassigned === 0 && totalAssigned > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-2 py-0.5">
              <CheckCircle2 className="w-3 h-3" />
              All assigned
            </span>
          )}
        </div>
      </div>

      {/* Outage Suppression Banner — shown when services are hidden from leakage list due to active outage */}
      {suppressedServices.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 mb-3 bg-indigo-50 border border-indigo-200 rounded-lg">
          <ShieldOff className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-indigo-800">
              {suppressedServices.length} service{suppressedServices.length !== 1 ? 's' : ''} suppressed from billing alerts due to active outage
            </p>
            <p className="text-xs text-indigo-600 mt-0.5">
              These services are unbilled but are excluded from the leakage list because they currently have an active Carbon outage.
              They will reappear once the outage is resolved.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {suppressedServices.map((s: any) => (
                <span key={s.externalId} className="inline-flex items-center gap-1 text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                  <ShieldOff className="w-2.5 h-2.5" />
                  {s.planName || s.externalId}
                  {s.outageTitle && <span className="opacity-70">— {s.outageTitle}</span>}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Auto-match running indicator */}
      {autoMatchRunning && (
        <div className="flex items-center gap-2 px-3 py-2 mb-3 bg-blue-50 border border-blue-200 rounded-lg text-xs">
          <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
          <span className="text-blue-700">Auto-matching high-confidence service pairs…</span>
        </div>
      )}

      {/* Zero cost warning banner */}
      {zeroCostServices > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 mb-3 bg-rose-50 border border-rose-200 rounded-lg text-xs">
          <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <span className="text-rose-700 flex-1">
            <span className="font-semibold">{zeroCostServices} service{zeroCostServices !== 1 ? 's' : ''}</span> have <span className="font-semibold">$0.00 supplier cost</span> — margin calculations will be inaccurate. Use <span className="font-semibold">Sync Costs</span> to re-apply costs from the latest SasBoss workbook, or edit costs manually on each service.
          </span>
        </div>
      )}

      {/* Billing Type Tabs */}
      <div className="flex gap-1 mb-4 bg-muted/40 rounded-lg p-1">
        {BILLING_TYPE_TABS.map(tab => {
          const tabServices = displayServices.filter(s => getBillingTypeForCategory(s.serviceCategory) === tab.id);
          const hasUnassigned = tabServices.length > 0;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all",
                activeTab === tab.id
                  ? "bg-white shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/50"
              )}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              {hasUnassigned && (
                <span className="bg-amber-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {tabServices.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab description */}
      <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1.5">
        <Info className="w-3 h-3" />
        {BILLING_TYPE_TABS.find(t => t.id === activeTab)?.description}
        {activeTab === "arrears" && " — these will appear on next month's invoice."}
        {activeTab === "non-recurring" && " — one-off charges, not recurring monthly."}
      </p>

      {/* Main two-column board */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT: Supplier Services */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              Supplier Services
              {categoriesForTab.length > 0 && (
                <span className="text-amber-600 font-bold ml-1">
                  ({displayServices.filter(s => getBillingTypeForCategory(s.serviceCategory) === activeTab).length} unassigned)
                </span>
              )}
            </h3>
            <span className="text-[10px] text-muted-foreground">← Drag onto a billing item →</span>
          </div>

          {categoriesForTab.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed border-border rounded-lg">
              <CheckCircle2 className="w-6 h-6 text-teal-500 mb-2" />
              <p className="text-sm font-medium text-teal-700">All {activeTab === "advance" ? "advance" : activeTab} services assigned</p>
              <p className="text-xs text-muted-foreground mt-1">No unassigned services in this category</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
              {categoriesForTab.map(cat => (
                <CategoryGroup
                  key={cat}
                  category={cat}
                  services={servicesByCategory[cat] || []}
                  dragState={dragState}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onAssignBillingPlatform={handleAssignBillingPlatform}
                />
              ))}
            </div>
          )}

          {/* Special Buckets */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Archive className="w-3 h-3" />
              Assignment Buckets
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {SPECIAL_BUCKETS.map(bucket => (
                <BucketDropTarget
                  key={bucket.id}
                  bucket={bucket}
                  isDragOver={dragOverTarget === `bucket-${bucket.id}`}
                  assignedCount={bucketAssignments[bucket.id]?.length ?? 0}
                  onDragOver={(e) => handleDragOver(e, `bucket-${bucket.id}`)}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDropOnBucket}
                />
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Xero Billing Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3 text-teal-500" />
              Xero Billing Items
              <span className="text-muted-foreground font-normal ml-1">({displayBillingItems.length})</span>
            </h3>
            <span className="text-[10px] text-muted-foreground">← Drop services here</span>
          </div>

          {displayBillingItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed border-border rounded-lg">
              <Inbox className="w-6 h-6 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No Xero billing items for this category</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Switch tabs or check Xero import</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {displayBillingItems.map(item => (
                <BillingItemDropTarget
                  key={item.externalId}
                  item={item}
                  isDragOver={dragOverTarget === `billing-${item.externalId}`}
                  onDragOver={(e) => handleDragOver(e, `billing-${item.externalId}`)}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDropOnBillingItem}
                  onRemoveAssignment={handleRemoveAssignment}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
