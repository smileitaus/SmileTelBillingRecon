/**
 * AssignToExistingCustomerDialog
 * Lets a reviewer search for an existing customer and assign a pending proposal's services to them.
 * Creates a Platform Check entry for each assigned service.
 */
import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Search,
  Loader2,
  UserCheck,
  X,
  CheckCircle2,
  Building2,
  Phone,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  proposalId: number;
  proposedName: string;
  serviceCount: number;
  onSuccess: () => void;
  onClose: () => void;
}

export default function AssignToExistingCustomerDialog({
  proposalId,
  proposedName,
  serviceCount,
  onSuccess,
  onClose,
}: Props) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<{
    externalId: string;
    name: string;
    contactName?: string | null;
    contactPhone?: string | null;
    siteAddress?: string | null;
    serviceCount?: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { data: results = [], isLoading: searching } = trpc.billing.customers.proposals.searchCustomers.useQuery(
    { search: debouncedSearch },
    { enabled: debouncedSearch.trim().length >= 2 }
  );

  const utils = trpc.useUtils();
  const assignMutation = trpc.billing.customers.proposals.assignToExisting.useMutation({
    onSuccess: () => {
      toast.success(`Services assigned to "${selectedCustomer?.name}" — Platform Check created`);
      utils.billing.customers.proposals.list.invalidate();
      utils.billing.customers.proposals.pendingCount.invalidate();
      utils.billing.platformChecks.list.invalidate();
      utils.billing.platformChecks.summary.invalidate();
      onSuccess();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleConfirm = () => {
    if (!selectedCustomer) return;
    assignMutation.mutate({
      proposalId,
      customerExternalId: selectedCustomer.externalId,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-primary" />
              Assign to Existing Customer
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Proposal: <span className="font-medium text-foreground">"{proposedName}"</span>
              {serviceCount > 0 && ` · ${serviceCount} service${serviceCount !== 1 ? "s" : ""} to assign`}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              ref={inputRef}
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setSelectedCustomer(null);
              }}
              placeholder="Search by customer name, contact, or Xero name..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-background border border-border rounded-lg outline-none focus:ring-2 focus:ring-ring"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {debouncedSearch.length > 0 && debouncedSearch.length < 2 && (
            <p className="text-xs text-muted-foreground mt-1.5 pl-1">Type at least 2 characters to search</p>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          {debouncedSearch.length >= 2 && !searching && results.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No customers found for "{debouncedSearch}"
            </div>
          )}
          {debouncedSearch.length < 2 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Search for a customer to assign these services to
            </div>
          )}
          {results.map((customer: any) => {
            const isSelected = selectedCustomer?.externalId === customer.externalId;
            return (
              <button
                key={customer.externalId}
                onClick={() => setSelectedCustomer(customer)}
                className={`w-full text-left px-3 py-3 rounded-lg mb-1 border transition-all ${
                  isSelected
                    ? "bg-primary/10 border-primary ring-1 ring-primary"
                    : "border-transparent hover:bg-muted hover:border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                      <span className="font-medium text-sm truncate">{customer.name}</span>
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">{customer.externalId}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      {customer.contactName && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Building2 className="w-3 h-3" />{customer.contactName}
                        </span>
                      )}
                      {customer.contactPhone && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="w-3 h-3" />{customer.contactPhone}
                        </span>
                      )}
                      {customer.siteAddress && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1 truncate max-w-xs">
                          <MapPin className="w-3 h-3 shrink-0" />{customer.siteAddress}
                        </span>
                      )}
                    </div>
                  </div>
                  {customer.serviceCount !== undefined && (
                    <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                      {customer.serviceCount} svc{customer.serviceCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected customer preview */}
        {selectedCustomer && (
          <div className="px-4 py-3 bg-primary/5 border-t border-primary/20 text-sm">
            <span className="text-muted-foreground">Assigning to: </span>
            <span className="font-semibold text-primary">{selectedCustomer.name}</span>
            <span className="text-muted-foreground ml-1">({selectedCustomer.externalId})</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-2 justify-end p-4 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!selectedCustomer || assignMutation.isPending}
          >
            {assignMutation.isPending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Assigning...</>
              : <><UserCheck className="w-3.5 h-3.5 mr-1.5" />Assign Services</>
            }
          </Button>
        </div>
      </div>
    </div>
  );
}
