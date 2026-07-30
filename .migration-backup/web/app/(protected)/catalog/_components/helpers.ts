import type { ProductStatus } from "@/api-client/types";

export function statusBadge(s: ProductStatus): "green" | "yellow" | "gray" {
  if (s === "active") return "green";
  if (s === "draft")  return "yellow";
  return "gray";
}

export function productStatusStyle(status: ProductStatus) {
  if (status === "active") {
    return {
      row: "border-l-success-500 bg-success-50/30 hover:bg-success-50/70",
      card: "border-l-success-500 bg-success-50/30",
      dot: "bg-success-500",
    };
  }
  if (status === "draft") {
    return {
      row: "border-l-warning-500 bg-warning-50/30 hover:bg-warning-50/70",
      card: "border-l-warning-500 bg-warning-50/30",
      dot: "bg-warning-500",
    };
  }
  return {
    row: "border-l-slate-300 bg-slate-50/70 text-slate-500 hover:bg-slate-100",
    card: "border-l-slate-300 bg-slate-50/80",
    dot: "bg-slate-400",
  };
}

export function metricToneClass(
  tone: "neutral" | "success" | "warning" | "muted" | "restricted",
) {
  const tones = {
    neutral:    "border-slate-200 bg-white",
    success:    "border-success-200 bg-success-50",
    warning:    "border-warning-200 bg-warning-50",
    muted:      "border-slate-200 bg-slate-50",
    restricted: "border-orange-200 bg-orange-50",
  };
  return tones[tone];
}
