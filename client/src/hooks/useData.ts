import { trpc } from "@/lib/trpc";
import { useState, useMemo, useCallback } from "react";

// ==================== Dashboard / Summary ====================
export function useSummary() {
  const { data, isLoading, error } = trpc.billing.summary.useQuery();
  return { summary: data ?? null, isLoading, error };
}

// ==================== Customer List with Search & Filters ====================
export function useCustomerSearch() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");

  const { data: customers, isLoading } = trpc.billing.customers.list.useQuery({
    search: query || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    platform: platformFilter !== "all" ? platformFilter : undefined,
  });

  const activeCustomers = useMemo(
    () => (customers ?? []).filter((c) => c.serviceCount > 0),
    [customers]
  );

  // Client-side sorting is still done in the component
  return {
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    platformFilter,
    setPlatformFilter,
    supplierFilter,
    setSupplierFilter,
    filtered: activeCustomers,
    totalActive: activeCustomers.length,
    isLoading,
  };
}

// ==================== Customer Detail ====================
export function useCustomerDetail(customerId: string) {
  const { data: customer, isLoading: customerLoading } =
    trpc.billing.customers.byId.useQuery(
      { id: customerId },
      { enabled: !!customerId }
    );

  const { data: customerServices, isLoading: servicesLoading } =
    trpc.billing.customers.services.useQuery(
      { customerId },
      { enabled: !!customerId }
    );

  const { data: customerLocations, isLoading: locationsLoading } =
    trpc.billing.customers.locations.useQuery(
      { customerId },
      { enabled: !!customerId }
    );

  const servicesByLocation = useMemo(() => {
    const map: Record<string, typeof customerServices> = {};
    if (!customerServices) return map;
    for (const s of customerServices) {
      const locId = s.locationExternalId || "unknown";
      if (!map[locId]) map[locId] = [];
      map[locId]!.push(s);
    }
    return map;
  }, [customerServices]);

  return {
    customer: customer ?? null,
    customerServices: customerServices ?? [],
    customerLocations: customerLocations ?? [],
    servicesByLocation,
    isLoading: customerLoading || servicesLoading || locationsLoading,
  };
}

// ==================== Service Detail ====================
export function useServiceDetail(serviceId: string) {
  const { data, isLoading } = trpc.billing.services.byId.useQuery(
    { id: serviceId },
    { enabled: !!serviceId }
  );

  return {
    service: data?.service ?? null,
    location: data?.location ?? null,
    customer: data?.customer ?? null,
    isLoading,
  };
}

// ==================== Supplier Accounts ====================
export function useSupplierAccounts() {
  const { data, isLoading } = trpc.billing.supplierAccounts.useQuery();
  return { supplierAccounts: data ?? [], isLoading };
}

// ==================== Global Search ====================
export function useGlobalSearch() {
  const utils = trpc.useUtils();

  const search = useCallback(
    async (q: string) => {
      if (!q || q.length < 2) return { customers: [], services: [] };
      try {
        const result = await utils.billing.search.fetch({ query: q });
        return result;
      } catch {
        return { customers: [], services: [] };
      }
    },
    [utils]
  );

  return { search };
}
