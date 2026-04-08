/**
 * ServiceEditPanel - slide-out panel for editing service details and reassigning to customers.
 * Name and Cost Price are read-only (system-managed fields).
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  X,
  Save,
  Search,
  ArrowRightLeft,
  UserX,
  History,
  ChevronDown,
  ChevronUp,
  Lock,
  Loader2,
  CheckCircle2,
} from "lucide-react";

import { KNOWN_SUPPLIERS, supplierLabel } from "@shared/suppliers";

const BILLING_PLATFORMS = ["OneBill", "SasBoss", "ECN", "Halo", "DataGate"];
const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "unmatched", label: "Unmatched" },
  { value: "flagged_for_termination", label: "Flagged for Termination" },
  { value: "terminated", label: "Terminated" },
];

interface ServiceEditPanelProps {
  serviceExternalId: string | null;
  onClose: () => void;
  onSaved?: () => void;
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        <Lock className="w-3 h-3" />
        {label}
        <span className="text-xs font-normal normal-case text-muted-foreground/60">(read-only)</span>
      </label>
      <div className="px-3 py-2 text-sm bg-muted/30 border border-border/50 rounded-md text-muted-foreground font-mono">
        {value || "—"}
      </div>
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md outline-none focus:ring-2 focus:ring-ring transition-all"
    />
  );
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md outline-none focus:ring-2 focus:ring-ring transition-all"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function PlatformCheckboxes({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (p: string) => {
    if (value.includes(p)) onChange(value.filter((x) => x !== p));
    else onChange([...value, p]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {BILLING_PLATFORMS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => toggle(p)}
          className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
            value.includes(p)
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border hover:bg-muted"
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function CustomerSearch({
  selectedCustomer,
  onSelect,
}: {
  selectedCustomer: { externalId: string; name: string } | null;
  onSelect: (c: { externalId: string; name: string } | null) => void;
}) {
  const [query, setQuery] = useState("");
  const search = trpc.billing.customers.list.useQuery(
    { search: query },
    { enabled: query.length >= 2 }
  );
  const results = (search.data as any)?.customers || search.data || [];

  if (selectedCustomer) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-md">
        <span className="text-sm font-medium flex-1">{selectedCustomer.name}</span>
        <span className="text-xs text-muted-foreground">{selectedCustomer.externalId}</span>
        <button onClick={() => onSelect(null)} className="text-muted-foreground hover:text-foreground">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customers by name..."
          className="w-full pl-10 pr-4 py-2 text-sm bg-background border border-border rounded-md outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {query.length >= 2 && (
        <div className="absolute z-[200] w-full mt-1 max-h-60 overflow-y-auto bg-card border border-border rounded-md shadow-xl">
          {results.map((c: any) => (
            <button
              key={c.externalId}
              onClick={() => { onSelect({ externalId: c.externalId, name: c.name }); setQuery(""); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors border-b border-border last:border-0"
            >
              <span className="font-medium">{c.name}</span>
              <span className="text-muted-foreground ml-2 text-xs">{c.externalId}</span>
            </button>
          ))}
          {results.length === 0 && (
            <p className="px-3 py-3 text-sm text-muted-foreground text-center">No customers found</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ServiceEditPanel({ serviceExternalId, onClose, onSaved }: ServiceEditPanelProps) {
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.billing.services.byId.useQuery(
    { id: serviceExternalId! },
    { enabled: !!serviceExternalId }
  );

  const { data: historyData } = trpc.billing.services.editHistory.useQuery(
    { serviceExternalId: serviceExternalId! },
    { enabled: !!serviceExternalId }
  );

  const service = data?.service;

  // Form state
  const [form, setForm] = useState<Record<string, string>>({});
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [reassignMode, setReassignMode] = useState<"keep" | "reassign" | "unknown">("keep");
  const [selectedCustomer, setSelectedCustomer] = useState<{ externalId: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Populate form when service loads
  useEffect(() => {
    if (!service) return;
    setForm({
      // Previously system-managed, now editable
      serviceId: service.serviceId || service.externalId || "",
      monthlyCost: service.monthlyCost != null ? String(service.monthlyCost) : "",
      serviceType: service.serviceType || "",
      provider: service.supplierName || service.provider || "",
      supplierName: service.supplierName || "",
      // Standard fields
      serviceTypeDetail: service.serviceTypeDetail || "",
      planName: service.planName || "",
      status: service.status || "active",
      locationAddress: service.locationAddress || "",
      phoneNumber: service.phoneNumber || "",
      email: service.email || "",
      connectionId: service.connectionId || "",
      avcId: service.avcId || "",
      ipAddress: service.ipAddress || "",
      technology: service.technology || "",
      speedTier: service.speedTier || "",
      simSerialNumber: service.simSerialNumber || "",
      hardwareType: service.hardwareType || "",
      macAddress: service.macAddress || "",
      modemSerialNumber: service.modemSerialNumber || "",
      wifiPassword: service.wifiPassword || "",
      simOwner: service.simOwner || "",
      dataPlanGb: service.dataPlanGb || "",
      userName: service.userName || "",
      contractEndDate: service.contractEndDate || "",
      serviceActivationDate: service.serviceActivationDate || "",
      serviceEndDate: service.serviceEndDate || "",
      proposedPlan: service.proposedPlan || "",
      proposedCost: service.proposedCost || "",
      discoveryNotes: service.discoveryNotes || "",
    });
    try {
      const bp = service.billingPlatform ? JSON.parse(service.billingPlatform) : [];
      setPlatforms(Array.isArray(bp) ? bp : []);
    } catch {
      setPlatforms([]);
    }
    setReassignMode("keep");
    setSelectedCustomer(null);
    setReason("");
  }, [service]);

  const updateMutation = trpc.billing.services.update.useMutation({
    onSuccess: () => {
      toast.success("Service updated successfully");
      utils.billing.services.byId.invalidate({ id: serviceExternalId! });
      utils.billing.services.editHistory.invalidate({ serviceExternalId: serviceExternalId! });
      utils.billing.review.issues.invalidate();
      // Refresh summary, margin, and customer panels so cost/revenue changes propagate everywhere
      utils.billing.summary.invalidate();
      utils.billing.margin.list.invalidate();
      utils.billing.margin.grouped.invalidate();
      utils.billing.customers.list.invalidate();
      utils.billing.customers.byId.invalidate();
      onSaved?.();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    if (!serviceExternalId) return;

    const updates: Record<string, unknown> = { ...form, billingPlatform: platforms };

    if (reassignMode === "reassign" && selectedCustomer) {
      updates.customerExternalId = selectedCustomer.externalId;
      updates.customerName = selectedCustomer.name;
    } else if (reassignMode === "unknown") {
      updates.customerExternalId = null;
      updates.customerName = null;
    }

    updateMutation.mutate({
      serviceExternalId,
      updates: updates as any,
      reason: reason || undefined,
    });
  };

  const f = (key: string) => form[key] ?? "";
  const setF = (key: string) => (v: string) => setForm((prev) => ({ ...prev, [key]: v }));

  if (!serviceExternalId) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-2xl bg-card border-l border-border shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/95 backdrop-blur-sm sticky top-0 z-10">
          <div>
            <h2 className="text-base font-semibold">Edit Service</h2>
            {service && (
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {service.externalId} · {service.serviceType}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateMutation.isPending || isLoading}
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <Save className="w-3.5 h-3.5 mr-1.5" />
              )}
              Save Changes
            </Button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !service ? (
          <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm">
            Service not found
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto overflow-x-visible">
            <div className="p-6 space-y-6">

              {/* Core service identity fields - now editable */}
              <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800/40 space-y-3">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
                  <Lock className="w-3 h-3" />
                  Core Service Fields
                  <span className="ml-1 text-xs font-normal normal-case text-amber-600 dark:text-amber-500">(editable until product mapping is complete)</span>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Service Name / ID">
                    <TextInput value={f("serviceId")} onChange={setF("serviceId")} placeholder="Service identifier" />
                  </FieldGroup>
                  <FieldGroup label="Monthly Cost (ex GST)">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                      <input
                        value={f("monthlyCost")}
                        onChange={(e) => setF("monthlyCost")(e.target.value)}
                        placeholder="0.00"
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-full pl-6 pr-3 py-2 text-sm bg-background border border-border rounded-md outline-none focus:ring-2 focus:ring-ring transition-all"
                      />
                    </div>
                  </FieldGroup>
                  <FieldGroup label="Service Type">
                    <SelectInput
                      value={f("serviceType")}
                      onChange={setF("serviceType")}
                      options={[
                        { value: "Voice", label: "Voice" },
                        { value: "Internet", label: "Internet" },
                        { value: "Mobile", label: "Mobile" },
                        { value: "Data", label: "Data" },
                        { value: "Other", label: "Other" },
                      ]}
                    />
                  </FieldGroup>
                  <FieldGroup label="Provider">
                    <div className="relative">
                      <select
                        value={KNOWN_SUPPLIERS.includes(f("provider") as any) ? f("provider") : f("provider") ? "__custom__" : ""}
                        onChange={(e) => {
                          if (e.target.value !== "__custom__") {
                            setF("provider")(e.target.value);
                          }
                        }}
                        className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md outline-none focus:ring-2 focus:ring-ring transition-all"
                      >
                        <option value="">Select provider...</option>
                        {KNOWN_SUPPLIERS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                        <option value="__custom__">Other (custom)...</option>
                      </select>
                      {f("provider") && !KNOWN_SUPPLIERS.includes(f("provider") as any) && (
                        <div className="mt-1.5">
                          <TextInput
                            value={f("provider")}
                            onChange={setF("provider")}
                            placeholder="Enter custom provider name"
                          />
                        </div>
                      )}
                    </div>
                  </FieldGroup>
                </div>
                <FieldGroup label="Supplier">
                  <div className="relative">
                    <select
                      value={KNOWN_SUPPLIERS.includes(f("supplierName") as any) ? f("supplierName") : f("supplierName") ? "__custom__" : ""}
                      onChange={(e) => {
                        if (e.target.value === "__custom__") {
                          // Keep current value, user will type in the text input
                        } else {
                          setF("supplierName")(e.target.value);
                        }
                      }}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md outline-none focus:ring-2 focus:ring-ring transition-all"
                    >
                      <option value="">Select supplier...</option>
                      {KNOWN_SUPPLIERS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                      <option value="__custom__">Other (custom)...</option>
                    </select>
                    {f("supplierName") && !KNOWN_SUPPLIERS.includes(f("supplierName") as any) && (
                      <div className="mt-1.5">
                        <TextInput
                          value={f("supplierName")}
                          onChange={setF("supplierName")}
                          placeholder="Enter custom supplier name"
                        />
                      </div>
                    )}
                  </div>
                </FieldGroup>
              </div>

              {/* Status */}
              <div className="grid grid-cols-2 gap-4">
                <FieldGroup label="Status">
                  <SelectInput value={f("status")} onChange={setF("status")} options={STATUS_OPTIONS} />
                </FieldGroup>
                <FieldGroup label="Service Detail / Sub-type">
                  <TextInput value={f("serviceTypeDetail")} onChange={setF("serviceTypeDetail")} placeholder="e.g. NBN 100/20, 4G Mobile" />
                </FieldGroup>
              </div>

              {/* Plan */}
              <FieldGroup label="Plan Name">
                <TextInput value={f("planName")} onChange={setF("planName")} placeholder="e.g. NBN Business 100" />
              </FieldGroup>

              {/* Billing Platforms */}
              <FieldGroup label="Billing Platform(s)">
                <PlatformCheckboxes value={platforms} onChange={setPlatforms} />
              </FieldGroup>

              {/* Connection details */}
              <div className="grid grid-cols-2 gap-4">
                <FieldGroup label="AVC / Connection ID">
                  <TextInput value={f("avcId")} onChange={setF("avcId")} placeholder="AVC ID" />
                </FieldGroup>
                <FieldGroup label="Connection ID (CID)">
                  <TextInput value={f("connectionId")} onChange={setF("connectionId")} placeholder="Connection ID" />
                </FieldGroup>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FieldGroup label="Technology">
                  <TextInput value={f("technology")} onChange={setF("technology")} placeholder="e.g. FTTP, FTTN, 4G" />
                </FieldGroup>
                <FieldGroup label="Speed Tier">
                  <TextInput value={f("speedTier")} onChange={setF("speedTier")} placeholder="e.g. 100/20" />
                </FieldGroup>
              </div>

              {/* Contact / Location */}
              <div className="grid grid-cols-2 gap-4">
                <FieldGroup label="Phone Number">
                  <TextInput value={f("phoneNumber")} onChange={setF("phoneNumber")} placeholder="04xx xxx xxx" />
                </FieldGroup>
                <FieldGroup label="Email">
                  <TextInput value={f("email")} onChange={setF("email")} placeholder="contact@example.com" />
                </FieldGroup>
              </div>

              <FieldGroup label="Location Address">
                <TextInput value={f("locationAddress")} onChange={setF("locationAddress")} placeholder="Full street address" />
              </FieldGroup>

              {/* Advanced fields toggle */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-2 border-t border-border"
              >
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showAdvanced ? "Hide" : "Show"} Hardware & Contract Fields
              </button>

              {showAdvanced && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FieldGroup label="SIM Serial Number">
                      <TextInput value={f("simSerialNumber")} onChange={setF("simSerialNumber")} />
                    </FieldGroup>
                    <FieldGroup label="SIM Owner / User">
                      <TextInput value={f("simOwner")} onChange={setF("simOwner")} />
                    </FieldGroup>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FieldGroup label="Hardware Type">
                      <TextInput value={f("hardwareType")} onChange={setF("hardwareType")} />
                    </FieldGroup>
                    <FieldGroup label="MAC Address">
                      <TextInput value={f("macAddress")} onChange={setF("macAddress")} />
                    </FieldGroup>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FieldGroup label="Modem Serial Number">
                      <TextInput value={f("modemSerialNumber")} onChange={setF("modemSerialNumber")} />
                    </FieldGroup>
                    <FieldGroup label="IP Address">
                      <TextInput value={f("ipAddress")} onChange={setF("ipAddress")} />
                    </FieldGroup>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FieldGroup label="Data Plan (GB)">
                      <TextInput value={f("dataPlanGb")} onChange={setF("dataPlanGb")} placeholder="e.g. 100" />
                    </FieldGroup>
                    <FieldGroup label="User Name">
                      <TextInput value={f("userName")} onChange={setF("userName")} />
                    </FieldGroup>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <FieldGroup label="Activation Date">
                      <TextInput value={f("serviceActivationDate")} onChange={setF("serviceActivationDate")} placeholder="YYYY-MM-DD" />
                    </FieldGroup>
                    <FieldGroup label="Contract End Date">
                      <TextInput value={f("contractEndDate")} onChange={setF("contractEndDate")} placeholder="YYYY-MM-DD" />
                    </FieldGroup>
                    <FieldGroup label="Service End Date">
                      <TextInput value={f("serviceEndDate")} onChange={setF("serviceEndDate")} placeholder="YYYY-MM-DD" />
                    </FieldGroup>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FieldGroup label="Proposed Plan">
                      <TextInput value={f("proposedPlan")} onChange={setF("proposedPlan")} />
                    </FieldGroup>
                    <FieldGroup label="Proposed Cost">
                      <TextInput value={f("proposedCost")} onChange={setF("proposedCost")} placeholder="e.g. 49.00" />
                    </FieldGroup>
                  </div>
                </div>
              )}

              {/* Notes */}
              <FieldGroup label="Notes">
                <textarea
                  value={f("discoveryNotes")}
                  onChange={(e) => setF("discoveryNotes")(e.target.value)}
                  rows={3}
                  placeholder="Internal notes about this service..."
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </FieldGroup>

              {/* Reassign Customer */}
              <div className="border border-border rounded-lg overflow-visible">
                <div className="px-4 py-3 bg-muted/30 border-b border-border rounded-t-lg">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4" />
                    Customer Assignment
                  </p>
                  {service.customerName && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Currently: <span className="font-medium">{service.customerName}</span>
                    </p>
                  )}
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex gap-2">
                    {[
                      { key: "keep", label: "Keep Current", icon: null },
                      { key: "reassign", label: "Reassign", icon: <ArrowRightLeft className="w-3 h-3" /> },
                      { key: "unknown", label: "Mark Unknown", icon: <UserX className="w-3 h-3" /> },
                    ].map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => { setReassignMode(opt.key as any); setSelectedCustomer(null); }}
                        className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-md border transition-colors ${
                          reassignMode === opt.key
                            ? opt.key === "unknown"
                              ? "bg-amber-500 text-white border-amber-500"
                              : "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        {opt.icon}
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {reassignMode === "reassign" && (
                    <CustomerSearch selectedCustomer={selectedCustomer} onSelect={setSelectedCustomer} />
                  )}

                  {reassignMode === "unknown" && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md">
                      <UserX className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="text-sm text-amber-700">Service will be unassigned and marked as unmatched</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Reason for change */}
              <FieldGroup label="Reason for Changes (optional)">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Briefly describe why these changes are being made..."
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </FieldGroup>

              {/* Edit History */}
              <div className="border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm font-medium flex items-center gap-2">
                    <History className="w-4 h-4" />
                    Edit History
                    {historyData && historyData.length > 0 && (
                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                        {historyData.length}
                      </span>
                    )}
                  </span>
                  {showHistory ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {showHistory && (
                  <div className="divide-y divide-border">
                    {!historyData || historyData.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-muted-foreground">No edit history yet</p>
                    ) : (
                      historyData.map((entry) => {
                        let changes: Record<string, { from: unknown; to: unknown }> = {};
                        try { changes = JSON.parse(entry.changes); } catch {}
                        return (
                          <div key={entry.id} className="px-4 py-3 text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{entry.editedBy}</span>
                              <span className="text-muted-foreground">
                                {new Date(entry.createdAt).toLocaleString()}
                              </span>
                            </div>
                            {entry.reason && (
                              <p className="text-muted-foreground italic">"{entry.reason}"</p>
                            )}
                            <div className="space-y-0.5">
                              {Object.entries(changes).map(([field, { from, to }]) => (
                                <div key={field} className="flex items-start gap-1 text-muted-foreground">
                                  <CheckCircle2 className="w-3 h-3 text-green-500 mt-0.5 shrink-0" />
                                  <span>
                                    <span className="font-medium text-foreground">{field}</span>:{" "}
                                    <span className="line-through opacity-60">{String(from) || "—"}</span>
                                    {" → "}
                                    <span className="text-green-600">{String(to) || "—"}</span>
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
