export interface Customer {
  id: string;
  name: string;
  billingPlatforms: string[];
  serviceCount: number;
  monthlyCost: number;
  unmatchedCount: number;
  matchedCount: number;
  status: "active" | "partial" | "review" | "flagged";
}

export interface Location {
  id: string;
  address: string;
  customerId: string;
  customerName: string;
  serviceCount: number;
  services: string[];
}

export interface BillingHistoryItem {
  period: string;
  cost: number;
  invoiceId: string;
  source: string;
}

export interface Service {
  id: string;
  serviceId: string;
  serviceType: "Internet" | "Mobile" | "Voice" | "VoIP" | "Other";
  serviceTypeDetail: string;
  planName: string;
  status: "active" | "unmatched" | "flagged" | "terminated";
  locationId: string;
  locationAddress: string;
  supplierAccount: string;
  supplierName: string;
  phoneNumber: string;
  email: string;
  connectionId: string;
  locId: string;
  ipAddress: string;
  customerName: string;
  customerId: string;
  monthlyCost: number;
  billingHistory: BillingHistoryItem[];
}

export interface SupplierAccount {
  accountNumber: string;
  supplierName: string;
  serviceCount: number;
  monthlyCost: number;
}

export interface Summary {
  totalCustomers: number;
  totalLocations: number;
  totalServices: number;
  matchedServices: number;
  unmatchedServices: number;
  totalMonthlyCost: number;
  servicesByType: Record<string, number>;
  supplierAccounts: SupplierAccount[];
  invoiceItemsProcessed: number;
  invoiceItemsMatched: number;
}
