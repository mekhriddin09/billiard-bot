import type { TableStatus } from "@/lib/types";

const META: Record<TableStatus, { label: string; bg: string; fg: string }> = {
  free: { label: "Bo'sh", bg: "bg-success/15", fg: "text-success" },
  active: { label: "Band", bg: "bg-surfaceMuted", fg: "text-surfaceMuted-foreground" },
  reserved: { label: "Saqlangan", bg: "bg-warning/15", fg: "text-warning" },
  off: { label: "Yopiq", bg: "bg-surfaceMuted", fg: "text-surfaceMuted-foreground" },
};

/** Stol holatini har doim rangli pill bilan ko'rsatadi — faqat matn bilan emas. */
export default function StatusPill({
  status,
  className = "",
}: {
  status: TableStatus;
  className?: string;
}) {
  const m = META[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11px] font-bold ${m.bg} ${m.fg} ${className}`}
    >
      {m.label}
    </span>
  );
}

/** Ixtiyoriy belgi — "Eng qulay", "Chegirma" kabi — doim warning rangida kichik pill. */
export function BadgePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-pill bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning">
      {children}
    </span>
  );
}
