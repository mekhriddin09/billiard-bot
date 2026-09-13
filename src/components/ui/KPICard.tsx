import { Card } from "./Card";
import type { BadgeTone } from "./Badge";

const ICON_TONE: Record<BadgeTone, string> = {
  green: "bg-success/20 text-success",
  red: "bg-destructive/20 text-destructive",
  gold: "bg-warning/20 text-warning",
  blue: "bg-primary/20 text-primary",
  purple: "bg-violet-400/20 text-violet-300",
  muted: "bg-foreground/[0.08] text-foreground/70",
};

const PCT_TONE = {
  up: "bg-success/15 text-success",
  down: "bg-destructive/15 text-destructive",
};

export default function KPICard({
  icon,
  label,
  value,
  sub,
  tone = "muted",
  pct,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: BadgeTone;
  /** foizli o'zgarish (avvalgi davrga nisbatan) — null bo'lsa ko'rsatilmaydi */
  pct?: number | null;
}) {
  return (
    <Card padding="none" className="p-3.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11.5px] font-medium leading-tight text-surfaceMuted-foreground">{label}</span>
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] ${ICON_TONE[tone]}`}
        >
          {icon}
        </span>
      </div>
      <div className="mt-2 text-[21px] font-bold leading-none text-foreground">{value}</div>
      {(pct !== undefined && pct !== null) || sub ? (
        <div className="mt-2 flex items-center gap-1.5">
          {pct !== undefined && pct !== null && (
            <span
              className={`shrink-0 rounded-full px-1.5 py-[1px] text-[10px] font-semibold tabular ${
                pct >= 0 ? PCT_TONE.up : PCT_TONE.down
              }`}
            >
              {pct >= 0 ? "+" : ""}
              {pct}%
            </span>
          )}
          {sub && <span className="truncate text-[10.5px] text-surfaceMuted-foreground/70">{sub}</span>}
        </div>
      ) : null}
    </Card>
  );
}
