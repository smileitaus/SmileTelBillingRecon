/**
 * Provider Badge Component
 * Displays a color-coded badge for upstream network providers
 * (Telstra, ABB, Vocus, Exetel, AAPT, Optus, Unknown)
 */

const providerStyles: Record<string, { bg: string; text: string; border: string }> = {
  Telstra: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  ABB: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  Vocus: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  Exetel: { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200" },
  AAPT: { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
  Optus: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  OptiComm: { bg: "bg-lime-50", text: "text-lime-700", border: "border-lime-200" },
  Unknown: { bg: "bg-gray-50", text: "text-gray-500", border: "border-gray-200" },
};

export function ProviderBadge({
  provider,
  size = "sm",
}: {
  provider: string | null | undefined;
  size?: "xs" | "sm";
}) {
  const name = provider || "Unknown";
  const style = providerStyles[name] || providerStyles.Unknown;
  const sizeClasses =
    size === "xs"
      ? "text-[9px] px-1.5 py-0"
      : "text-[10px] px-2 py-0.5";

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full border ${style.bg} ${style.text} ${style.border} ${sizeClasses}`}
    >
      {name}
    </span>
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
    ABB: "bg-indigo-500",
    Vocus: "bg-purple-500",
    Exetel: "bg-cyan-500",
    AAPT: "bg-teal-500",
    Optus: "bg-emerald-500",
    OptiComm: "bg-lime-500",
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

export const PROVIDER_COLORS: Record<string, string> = {
  Telstra: "oklch(0.55 0.15 250)",
  ABB: "oklch(0.5 0.15 280)",
  Vocus: "oklch(0.55 0.15 300)",
  Exetel: "oklch(0.55 0.15 200)",
  AAPT: "oklch(0.55 0.15 170)",
  Optus: "oklch(0.55 0.15 150)",
  OptiComm: "oklch(0.55 0.15 130)",
  Unknown: "oklch(0.6 0.01 56)",
};
