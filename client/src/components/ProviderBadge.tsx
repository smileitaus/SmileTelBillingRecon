/**
 * Provider Badge Component
 * Displays a color-coded badge with supplier logos for upstream network providers.
 *
 * To add a new supplier:
 *   1. Add the key to shared/suppliers.ts (KNOWN_SUPPLIERS + SUPPLIER_COLORS)
 *   2. Add a providerConfig entry below for badge styling (and logo if available)
 *   Everything else (dropdowns, filters) updates automatically.
 */
import { SUPPLIER_COLORS } from "@shared/suppliers";

const TELSTRA_LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663389833130/4LVfr96qhVoYSkLinpTZkt/telstra-logo_b494a2f4.png";
const ABB_LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663389833130/4LVfr96qhVoYSkLinpTZkt/abb-logo_9ac49ae1.png";

const providerConfig: Record<string, {
  bg: string;
  text: string;
  border: string;
  logo?: string;
  label: string;
}> = {
  Telstra: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    logo: TELSTRA_LOGO,
    label: "Telstra",
  },
  ABB: {
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
    logo: ABB_LOGO,
    label: "ABB",
  },
  Vocus: {
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
    label: "Vocus",
  },
  Exetel: {
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    border: "border-cyan-200",
    label: "Exetel",
  },
  AAPT: {
    bg: "bg-teal-50",
    text: "text-teal-700",
    border: "border-teal-200",
    label: "AAPT",
  },
  Optus: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    label: "Optus",
  },
  OptiComm: {
    bg: "bg-lime-50",
    text: "text-lime-700",
    border: "border-lime-200",
    label: "OptiComm",
  },
  ChannelHaus: {
    bg: "bg-violet-50",
    text: "text-violet-700",
    border: "border-violet-200",
    label: "Channel Haus",
  },
  Legion: {
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
    label: "Legion",
  },
  "Tech-e": {
    bg: "bg-orange-50",
    text: "text-orange-700",
    border: "border-orange-200",
    label: "Tech-e",
  },
  VineDirect: {
    bg: "bg-green-50",
    text: "text-green-800",
    border: "border-green-300",
    label: "Vine Direct",
  },
  Infinet: {
    bg: "bg-sky-50",
    text: "text-sky-700",
    border: "border-sky-200",
    label: "Infinet",
  },
  Blitznet: {
    bg: "bg-yellow-50",
    text: "text-yellow-800",
    border: "border-yellow-300",
    label: "Blitznet",
  },
  TIAB: {
    bg: "bg-slate-50",
    text: "text-slate-700",
    border: "border-slate-200",
    label: "TIAB",
  },
  SmileTel: {
    bg: "bg-pink-50",
    text: "text-pink-700",
    border: "border-pink-200",
    label: "SmileTel",
  },
  SasBoss: {
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    border: "border-indigo-200",
    label: "SasBoss",
  },
  Starlink: {
    bg: "bg-blue-50",
    text: "text-blue-800",
    border: "border-blue-300",
    label: "Starlink",
  },
  Access4: {
    bg: "bg-violet-50",
    text: "text-violet-800",
    border: "border-violet-200",
    label: "Access4",
  },
  CommsCode: {
    bg: "bg-sky-50",
    text: "text-sky-800",
    border: "border-sky-200",
    label: "CommsCode",
  },
  DataGate: {
    bg: "bg-blue-50",
    text: "text-blue-800",
    border: "border-blue-300",
    label: "DataGate",
  },
  TPG: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    label: "TPG",
  },
  Unknown: {
    bg: "bg-gray-50",
    text: "text-gray-500",
    border: "border-gray-200",
    label: "Unknown",
  },
};

export function ProviderBadge({
  provider,
  size = "sm",
  showLabel = true,
}: {
  provider: string | null | undefined;
  size?: "xs" | "sm" | "md";
  showLabel?: boolean;
}) {
  const name = provider || "Unknown";
  const config = providerConfig[name] || providerConfig.Unknown;

  const sizeClasses = {
    xs: "text-[9px] px-1.5 py-0 gap-1",
    sm: "text-[10px] px-2 py-0.5 gap-1",
    md: "text-xs px-2.5 py-1 gap-1.5",
  }[size];

  const logoSize = {
    xs: "w-3 h-3",
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
  }[size];

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full border ${config.bg} ${config.text} ${config.border} ${sizeClasses}`}
    >
      {config.logo && (
        <img
          src={config.logo}
          alt={config.label}
          className={`${logoSize} object-contain`}
        />
      )}
      {showLabel && config.label}
    </span>
  );
}

export function ProviderLogo({
  provider,
  size = "sm",
}: {
  provider: string | null | undefined;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const name = provider || "Unknown";
  const config = providerConfig[name] || providerConfig.Unknown;

  const logoSize = {
    xs: "w-4 h-4",
    sm: "w-5 h-5",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  }[size];

  if (!config.logo) {
    // Fallback: colored dot with text
    return (
      <span className="inline-flex items-center gap-1">
        <span className={`w-2 h-2 rounded-full ${config.bg} ${config.border} border`} />
        <span className={`text-[10px] font-medium ${config.text}`}>{config.label}</span>
      </span>
    );
  }

  return (
    <img
      src={config.logo}
      alt={config.label}
      title={config.label}
      className={`${logoSize} object-contain`}
    />
  );
}

export function ProviderDot({
  provider,
}: {
  provider: string | null | undefined;
}) {
  const name = provider || "Unknown";
  const dotColors: Record<string, string> = {
    Telstra: "bg-blue-500",
    ABB: "bg-green-600",
    Vocus: "bg-purple-500",
    Exetel: "bg-cyan-500",
    AAPT: "bg-teal-500",
    Optus: "bg-emerald-500",
    OptiComm: "bg-lime-500",
    ChannelHaus: "bg-violet-500",
    Legion: "bg-rose-500",
    "Tech-e": "bg-orange-500",
    VineDirect: "bg-green-600",
    Infinet: "bg-sky-500",
    Blitznet: "bg-yellow-500",
    TIAB: "bg-slate-500",
    SmileTel: "bg-pink-500",
    SasBoss: "bg-indigo-500",
    Starlink: "bg-blue-700",
    Unknown: "bg-gray-400",
  };
  const color = dotColors[name] || dotColors.Unknown;

  return (
    <span className="inline-flex items-center gap-1">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-[10px] text-muted-foreground">{name}</span>
    </span>
  );
}

// PROVIDER_COLORS is now driven by shared/suppliers.ts — add new entries there.
export const PROVIDER_COLORS: Record<string, string> = SUPPLIER_COLORS;

export { providerConfig };
