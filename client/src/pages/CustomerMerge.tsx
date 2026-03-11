/*
 * Customer Merge — search for two customer records and merge them.
 * Shows side-by-side comparison, lets user pick primary record,
 * then merges services, locations, billing items, and contact data.
 */

import { Link } from "wouter";
import {
  ArrowLeft,
  Search,
  Loader2,
  ArrowRight,
  Merge,
  Users,
  AlertTriangle,
  Check,
  Building2,
  Phone,
  Mail,
  MapPin,
  DollarSign,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

function formatCurrency(val: number) {
  return `$${val.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function CustomerCard({ customer, selected, onSelect, label }: {
  customer: any;
  selected: boolean;
  onSelect: () => void;
  label: string;
}) {
  return (
    <div
      onClick={onSelect}
      className={`bg-card border-2 rounded-lg p-5 cursor-pointer transition-all ${
        selected ? "border-primary shadow-md" : "border-border hover:border-primary/30"
      }`}
    >
      {selected && (
        <div className="flex items-center gap-1.5 mb-3">
          <Check className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] uppercase tracking-wider text-primary font-bold">{label}</span>
        </div>
      )}
      <h3 className="text-sm font-bold mb-3">{customer.name}</h3>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Building2 className="w-3 h-3" />
          <span>{customer.xeroContactName || "No Xero name"}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="w-3 h-3" />
          <span>{customer.contactName || "No contact"}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Mail className="w-3 h-3" />
          <span>{customer.contactEmail || "No email"}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Phone className="w-3 h-3" />
          <span>{customer.contactPhone || "No phone"}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin className="w-3 h-3" />
          <span className="truncate">{customer.siteAddress || "No address"}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <DollarSign className="w-3 h-3 text-muted-foreground" />
          <span className="data-value">{customer.serviceCount} services · {formatCurrency(customer.monthlyCost)}/mo</span>
        </div>
        {customer.billingPlatforms && customer.billingPlatforms.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {customer.billingPlatforms.map((p: string) => (
              <span key={p} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium">{p}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CustomerMerge() {
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  const [customerA, setCustomerA] = useState<any>(null);
  const [customerB, setCustomerB] = useState<any>(null);
  const [primarySide, setPrimarySide] = useState<"a" | "b">("a");
  const [confirming, setConfirming] = useState(false);

  const { data: resultsA } = trpc.billing.merge.search.useQuery(
    { search: searchA },
    { enabled: searchA.length >= 2 }
  );
  const { data: resultsB } = trpc.billing.merge.search.useQuery(
    { search: searchB },
    { enabled: searchB.length >= 2 }
  );

  const mergeMutation = trpc.billing.merge.execute.useMutation();
  const utils = trpc.useUtils();

  const handleMerge = async () => {
    if (!customerA || !customerB) return;
    const primary = primarySide === "a" ? customerA : customerB;
    const secondary = primarySide === "a" ? customerB : customerA;

    try {
      await mergeMutation.mutateAsync({
        primaryExternalId: primary.externalId,
        secondaryExternalId: secondary.externalId,
      });
      toast.success(`Merged "${secondary.name}" into "${primary.name}"`);
      setCustomerA(null);
      setCustomerB(null);
      setSearchA("");
      setSearchB("");
      setConfirming(false);
      utils.billing.customers.list.invalidate();
      utils.billing.summary.invalidate();
    } catch (e: any) {
      toast.error(e.message || "Merge failed");
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      {/* Header */}
      <Link
        href="/customers"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Customers
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Merge className="w-5 h-5" />
          Merge Customer Records
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search for two customer records to merge. All services, locations, billing items, and contact data from the secondary record will be moved to the primary.
        </p>
      </div>

      {/* Search panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Side A */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
            Customer A
          </label>
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchA}
              onChange={e => { setSearchA(e.target.value); setCustomerA(null); }}
              placeholder="Search customer name..."
              className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-md outline-none focus:ring-1 focus:ring-primary/40"
            />
            {resultsA && resultsA.length > 0 && !customerA && (
              <div className="absolute z-10 top-full mt-1 w-full bg-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                {resultsA.map((c: any) => (
                  <button
                    key={c.externalId}
                    onClick={() => { setCustomerA(c); setSearchA(c.name); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between"
                    disabled={customerB?.externalId === c.externalId}
                  >
                    <span className={customerB?.externalId === c.externalId ? "text-muted-foreground" : ""}>{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.serviceCount} svc</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {customerA && (
            <CustomerCard
              customer={customerA}
              selected={primarySide === "a"}
              onSelect={() => setPrimarySide("a")}
              label="Primary (keep)"
            />
          )}
        </div>

        {/* Side B */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
            Customer B
          </label>
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchB}
              onChange={e => { setSearchB(e.target.value); setCustomerB(null); }}
              placeholder="Search customer name..."
              className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-md outline-none focus:ring-1 focus:ring-primary/40"
            />
            {resultsB && resultsB.length > 0 && !customerB && (
              <div className="absolute z-10 top-full mt-1 w-full bg-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                {resultsB.map((c: any) => (
                  <button
                    key={c.externalId}
                    onClick={() => { setCustomerB(c); setSearchB(c.name); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between"
                    disabled={customerA?.externalId === c.externalId}
                  >
                    <span className={customerA?.externalId === c.externalId ? "text-muted-foreground" : ""}>{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.serviceCount} svc</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {customerB && (
            <CustomerCard
              customer={customerB}
              selected={primarySide === "b"}
              onSelect={() => setPrimarySide("b")}
              label="Primary (keep)"
            />
          )}
        </div>
      </div>

      {/* Merge action */}
      {customerA && customerB && (
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <div>
              <p className="text-sm font-medium">
                Merge "{primarySide === "a" ? customerB.name : customerA.name}" into "{primarySide === "a" ? customerA.name : customerB.name}"
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                All services, locations, and billing items will be moved to the primary record. The secondary record will be deleted. This cannot be undone.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-muted/30 rounded-md">
            <div className="text-center flex-1">
              <p className="text-xs text-muted-foreground">Secondary (delete)</p>
              <p className="text-sm font-medium text-red-700 mt-0.5">
                {primarySide === "a" ? customerB.name : customerA.name}
              </p>
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0" />
            <div className="text-center flex-1">
              <p className="text-xs text-muted-foreground">Primary (keep)</p>
              <p className="text-sm font-medium text-emerald-700 mt-0.5">
                {primarySide === "a" ? customerA.name : customerB.name}
              </p>
            </div>
          </div>

          {!confirming ? (
            <Button onClick={() => setConfirming(true)} variant="destructive" className="w-full">
              <Merge className="w-4 h-4 mr-2" />
              Merge Records
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-center text-destructive font-medium">
                Are you sure? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <Button onClick={() => setConfirming(false)} variant="outline" className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleMerge} variant="destructive" className="flex-1" disabled={mergeMutation.isPending}>
                  {mergeMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Merging...</>
                  ) : (
                    <><Merge className="w-4 h-4 mr-2" /> Confirm Merge</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
