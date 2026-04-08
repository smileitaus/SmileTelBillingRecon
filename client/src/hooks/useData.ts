import { trpc } from "@/lib/trpc";
import { useState, useMemo, useCallback } from "react";
import { useSearchParams } from "wouter";
import { useDebounce } from "@/hooks/useDebounce";

// ==================== Dashboard / Summary ====================
export function useSummary() {
  const { data, isLoading, error, dataUpdatedAt, refetch } = trpc.billing.summary.useQuery(undefined, {
    // Always re-fetch on mount and window focus so the dashboard stays current
    staleTime: 0,
    refetchOnWindowFocus: true,
    // Auto-refresh every 30 seconds so the dashboard reflects recent data changes
    refetchInterval: 30_000,
  });
  return { summary: data ?? null, isLoading, error, dataUpdatedAt, refetch };
}

// ==================== Customer List with Search & Filters ====================
export function useCustomerSearch() {
  // All filter state lives in URL search params so navigation preserves filters
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get("q") ?? "";
  const statusFilter = searchParams.get("status") ?? "all";
  const platformFilter = searchParams.get("platform") ?? "all";
  const supplierFilter = searchParams.get("supplier") ?? "all";
  const customerTypeFilter = searchParams.get("type") ?? "all";

  const setQuery = useCallback((v: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v) next.set("q", v); else next.delete("q");
      return next;
    });
  }, [setSearchParams]);

  const setStatusFilter = useCallback((v: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v && v !== "all") next.set("status", v); else next.delete("status");
      return next;
    });
  }, [setSearchParams]);

  const setPlatformFilter = useCallback((v: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v && v !== "all") next.set("platform", v); else next.delete("platform");
      return next;
    });
  }, [setSearchParams]);

  const setSupplierFilter = useCallback((v: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v && v !== "all") next.set("supplier", v); else next.delete("supplier");
      return next;
    });
  }, [setSearchParams]);

  const setCustomerTypeFilter = useCallback((v: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v && v !== "all") next.set("type", v); else next.delete("type");
      return next;
    });
  }, [setSearchParams]);

  // Debounce the search query so API calls only fire after 350ms of inactivity
  const debouncedQuery = useDebounce(query, 350);

  const { data: customers, isLoading } = trpc.billing.customers.list.useQuery({
    search: debouncedQuery || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    platform: platformFilter !== "all" ? platformFilter : undefined,
    supplier: supplierFilter !== "all" ? supplierFilter : undefined,
    customerType: customerTypeFilter !== "all" ? customerTypeFilter : undefined,
  }, {
    // Always re-fetch on mount so the list is fresh after a merge or navigation
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  const allCustomers = useMemo(
    () => customers ?? [],
    [customers]
  );

  const totalWithServices = useMemo(
    () => allCustomers.filter((c) => c.serviceCount > 0).length,
    [allCustomers]
  );

  // Build a filter query string for use in back-navigation links
  const filterSearch = searchParams.toString();

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
    customerTypeFilter,
    setCustomerTypeFilter,
    filtered: allCustomers,
    totalActive: allCustomers.length,
    totalWithServices,
    isLoading,
    filterSearch,
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
      // Exclude terminated services from location groups — they appear in Flagged & Terminated section
      if (s.status === "terminated") continue;
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
  const { data, isLoading } = trpc.billing.supplierAccounts.useQuery(undefined, {
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
  return { supplierAccounts: data ?? [], isLoading };
}

// ==================== Global Search ====================
export function useGlobalSearch() {
  const utils = trpc.useUtils();

  const search = useCallback(
    async (q: string) => {
      if (!q || q.length < 2) return { customers: [], services: [], vocusNbn: [], vocusMobile: [] };
      try {
        const result = await utils.billing.search.fetch({ query: q });
        return result;
      } catch {
        return { customers: [], services: [], vocusNbn: [], vocusMobile: [] };
      }
    },
    [utils]
  );

  return { search };
}
