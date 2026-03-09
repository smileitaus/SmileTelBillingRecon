import { useState, useMemo, useCallback } from "react";
import type { Customer, Location, Service, Summary, SupplierAccount } from "@/lib/types";

import customersData from "@/data/customers.json";
import locationsData from "@/data/locations.json";
import servicesData from "@/data/services.json";
import summaryData from "@/data/summary.json";
import supplierAccountsData from "@/data/supplierAccounts.json";

const customers = customersData as Customer[];
const locations = locationsData as Location[];
const services = servicesData as Service[];
const summary = summaryData as Summary;
const supplierAccounts = supplierAccountsData as SupplierAccount[];

export function useData() {
  return { customers, locations, services, summary, supplierAccounts };
}

export function useCustomerSearch() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");

  const activeCustomers = useMemo(
    () => customers.filter((c) => c.serviceCount > 0),
    []
  );

  const filtered = useMemo(() => {
    let result = activeCustomers;

    if (query) {
      const q = query.toLowerCase();
      // Search across customers, services, and phone numbers
      const matchingCustomerIds = new Set<string>();

      // Direct customer name match
      for (const c of activeCustomers) {
        if (c.name.toLowerCase().includes(q)) {
          matchingCustomerIds.add(c.id);
        }
      }

      // Service-level search (phone, AVC, email, plan)
      for (const s of services) {
        if (
          s.phoneNumber.replace(/\s/g, "").includes(q.replace(/\s/g, "")) ||
          s.connectionId.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q) ||
          s.serviceId.toLowerCase().includes(q) ||
          s.planName.toLowerCase().includes(q)
        ) {
          if (s.customerId) {
            matchingCustomerIds.add(s.customerId);
          }
        }
      }

      result = result.filter((c) => matchingCustomerIds.has(c.id));
    }

    if (statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter);
    }

    if (platformFilter !== "all") {
      result = result.filter((c) =>
        c.billingPlatforms.includes(platformFilter)
      );
    }

    return result;
  }, [query, statusFilter, platformFilter, activeCustomers]);

  return {
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    platformFilter,
    setPlatformFilter,
    supplierFilter,
    setSupplierFilter,
    filtered,
    totalActive: activeCustomers.length,
  };
}

export function useCustomerDetail(customerId: string) {
  const customer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customerId]
  );

  const customerServices = useMemo(
    () => services.filter((s) => s.customerId === customerId),
    [customerId]
  );

  const customerLocations = useMemo(() => {
    const locIds = new Set(customerServices.map((s) => s.locationId));
    return locations.filter((l) => locIds.has(l.id));
  }, [customerServices]);

  const servicesByLocation = useMemo(() => {
    const map: Record<string, Service[]> = {};
    for (const s of customerServices) {
      if (!map[s.locationId]) map[s.locationId] = [];
      map[s.locationId].push(s);
    }
    return map;
  }, [customerServices]);

  return { customer, customerServices, customerLocations, servicesByLocation };
}

export function useServiceDetail(serviceId: string) {
  const service = useMemo(
    () => services.find((s) => s.id === serviceId),
    [serviceId]
  );

  const location = useMemo(
    () => (service ? locations.find((l) => l.id === service.locationId) : undefined),
    [service]
  );

  const customer = useMemo(
    () => (service ? customers.find((c) => c.id === service.customerId) : undefined),
    [service]
  );

  return { service, location, customer };
}

export function useGlobalSearch() {
  const search = useCallback((q: string) => {
    if (!q || q.length < 2) return { customers: [], services: [] };
    const query = q.toLowerCase();
    const qNoSpace = query.replace(/\s/g, "");

    const matchedCustomers = customers
      .filter((c) => c.serviceCount > 0 && c.name.toLowerCase().includes(query))
      .slice(0, 5);

    const matchedServices = services
      .filter(
        (s) =>
          s.phoneNumber.replace(/\s/g, "").includes(qNoSpace) ||
          s.connectionId.toLowerCase().includes(query) ||
          s.serviceId.toLowerCase().includes(query) ||
          s.email.toLowerCase().includes(query)
      )
      .slice(0, 8);

    return { customers: matchedCustomers, services: matchedServices };
  }, []);

  return { search };
}
