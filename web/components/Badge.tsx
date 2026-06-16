import { clsx } from "clsx";

type BadgeVariant = "gray" | "blue" | "green" | "yellow" | "red" | "purple";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: "sm" | "md";
}

const variantClass: Record<BadgeVariant, string> = {
  gray: "bg-gray-100 text-gray-700",
  blue: "bg-blue-100 text-blue-700",
  green: "bg-green-100 text-green-700",
  yellow: "bg-yellow-100 text-yellow-800",
  red: "bg-red-100 text-red-700",
  purple: "bg-purple-100 text-purple-700",
};

export function Badge({ children, variant = "gray", size = "md" }: BadgeProps) {
  return (
    <span className={clsx(
      "inline-flex items-center rounded-full font-medium",
      size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-0.5 text-xs",
      variantClass[variant]
    )}>
      {children}
    </span>
  );
}

export function statusBadge(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    open: "blue", active: "green", completed: "green", paid: "green", received: "green",
    partial: "yellow", partially_received: "yellow", draft: "gray", pending: "yellow",
    refunded: "purple", voided: "gray", void: "gray", cancelled: "gray",
    archived: "gray", closed: "gray", overdue: "red", failed: "red",
  };
  return map[status.toLowerCase()] ?? "gray";
}
