/*
 * Service Linking — Review auto-match candidates and run bulk or individual merges
 * Shows Xero billing stubs that can be linked to supplier services
 */
import { useState } from "react";
import { Link } from "wouter";
import {
  Link2,
  Loader2,
  Check,
  ChevronRight,
  ArrowRight,
  Wifi,
  Phone,
  Smartphone,
  Globe,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProviderBadge } from "@/components/ProviderBadge";

function ServiceTypeIcon({ type }: { type: string }) {
  switch (type?.toLowerCase()) {
    case "internet": return <Wifi className="w-4 h-4" />;
    case "voice": return <Phone className="w-4 h-4" />;
    case "mobile": return <Smartphone className="w-4 h-4" />;
    default: return <Globe className="w-4 h-4" />;
  }
}

export default function ServiceBillingMatch() {
  const utils = trpc.useUtils();
  const { data: candidates = [], isLoading } = trpc.billing.serviceBillingMatch.candidates.useQuery();
  const mergeMutation = trpc.billing.serviceBillingMatch.merge.useMutation({
    onSuccess: (result, variables) => {
      toast.success(`Linked — ${result.billingItemsMoved} billing item(s) moved, revenue now $${result.newRevenue.toFixed(2)}/mo`);
      utils.billing.serviceBillingMatch.candidates.invalidate();
      utils.billing.summary.invalidate();
    },
    onError: (err) => toast.error(`Failed to link: ${err.message}`),
  });

  const [merging, setMerging] = useState<Set<string>>(new Set());
  const [merged, setMerged] = useState<Set<string>>(new Set());

  const handleMerge = async (xeroServiceId: string, supplierServiceId: string) => {
    const key = `${xeroServiceId}-${supplierServiceId}`;
    setMerging(prev => new Set(prev).add(key));
    try {
      await mergeMutation.mutateAsync({
        xeroServiceExternalId: xeroServiceId,
        supplierServiceExternalId: supplierServiceId,
      });
      setMerged(prev => new Set(prev).add(key));
    } finally {
      setMerging(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  };

  const handleMergeAll = async () => {
    const pending = candidates.filter(c => !merged.has(`${c.xeroServiceId}-${c.supplierServiceId}`));
    if (pending.length === 0) return;
    toast.info(`Linking ${pending.length} service${pending.length !== 1 ? 's' : ''}...`);
    let successCount = 0;
    for (const c of pending) {
      const key = `${c.xeroServiceId}-${c.supplierServiceId}`;
      setMerging(prev => new Set(prev).add(key));
      try {
        await mergeMutation.mutateAsync({
          xeroServiceExternalId: c.xeroServiceId,
          supplierServiceExternalId: c.supplierServiceId,
        });
        setMerged(prev => new Set(prev).add(key));
        successCount++;
      } catch {
        // continue
      } finally {
        setMerging(prev => { const s = new Set(prev); s.delete(key); return s; });
      }
    }
    toast.success(`Linked ${successCount} of ${pending.length} services`);
  };

  const pendingCount = candidates.filter(c => !merged.has(`${c.xeroServiceId}-${c.supplierServiceId}`)).length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            Service Linking
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Link Xero billing items to supplier services for the same customer.
            These are confident 1:1 matches — same customer, same service type, one supplier service.
          </p>
        </div>
        {pendingCount > 0 && (
          <Button
            onClick={handleMergeAll}
            disabled={mergeMutation.isPending}
            className="shrink-0 flex items-center gap-2"
          >
            {mergeMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            Link All ({pendingCount})
          </Button>
        )}
      </div>

      {/* Stats */}
      {!isLoading && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground">Candidates Found</p>
            <p className="text-2xl font-bold mt-0.5">{candidates.length}</p>
          </div>
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold mt-0.5 text-amber-600">{pendingCount}</p>
          </div>
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground">Linked This Session</p>
            <p className="text-2xl font-bold mt-0.5 text-green-600">{merged.size}</p>
          </div>
        </div>
      )}

      {/* Candidates list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : candidates.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Check className="w-10 h-10 mx-auto mb-3 text-green-500" />
          <p className="font-medium text-foreground">All services linked</p>
          <p className="text-sm mt-1">No auto-match candidates found. Use the manual link button on customer detail pages for ambiguous cases.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {candidates.map((c) => {
            const key = `${c.xeroServiceId}-${c.supplierServiceId}`;
            const isMerging = merging.has(key);
            const isMerged = merged.has(key);
            return (
              <div
                key={key}
                className={`bg-card border border-border rounded-lg overflow-hidden transition-all ${isMerged ? "opacity-50" : ""}`}
              >
                {/* Customer header */}
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/30">
                  <Link
                    href={`/customers/${c.customerExternalId}`}
                    className="text-sm font-medium hover:underline flex-1 truncate"
                  >
                    {c.customerName}
                  </Link>
                  <span className="text-xs text-muted-foreground shrink-0">{c.customerExternalId}</span>
                </div>
                {/* Match row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Xero stub */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                        <ServiceTypeIcon type={c.serviceType} />
                      </div>
                      <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Xero Billing</span>
                    </div>
                    <p className="text-sm font-medium">{c.serviceType}</p>
                    <p className="text-xs text-muted-foreground">{c.xeroServiceDetail}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      ${c.xeroRevenue.toFixed(2)}/mo · {c.billingItemCount} billing item{c.billingItemCount !== 1 ? 's' : ''}
                    </p>
                  </div>

                  {/* Arrow */}
                  <div className="shrink-0 flex flex-col items-center gap-1">
                    <ArrowRight className="w-5 h-5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">link to</span>
                  </div>

                  {/* Supplier service */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                        <ServiceTypeIcon type={c.serviceType} />
                      </div>
                      <ProviderBadge provider={c.supplierProvider} size="xs" />
                    </div>
                    <p className="text-sm font-medium">{c.serviceType}</p>
                    <p className="text-xs text-muted-foreground">{c.supplierServiceDetail}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      ${c.supplierCost.toFixed(2)}/mo cost
                    </p>
                  </div>

                  {/* Action */}
                  <div className="shrink-0 ml-2">
                    {isMerged ? (
                      <div className="flex items-center gap-1.5 text-green-600 text-sm">
                        <Check className="w-4 h-4" />
                        Linked
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isMerging}
                        onClick={() => handleMerge(c.xeroServiceId, c.supplierServiceId)}
                        className="flex items-center gap-1.5"
                      >
                        {isMerging ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Link2 className="w-3.5 h-3.5" />
                        )}
                        Link
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer note */}
      {!isLoading && candidates.length > 0 && (
        <p className="text-xs text-muted-foreground mt-4 text-center">
          For ambiguous cases (multiple supplier services of the same type), use the link icon on individual service rows in the Customer Detail page.
        </p>
      )}
    </div>
  );
}
