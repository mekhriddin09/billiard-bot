"use client";

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/** Compact ring chart with a centered total — no external chart lib needed. */
export default function DonutChart({
  slices,
  centerLabel,
  centerValue,
}: {
  slices: DonutSlice[];
  centerLabel: string;
  centerValue: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = 38;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        <svg width="128" height="128" viewBox="0 0 100 100" className="-rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(var(--foreground) / 0.06)" strokeWidth="12" />
          {total > 0 &&
            slices
              .filter((s) => s.value > 0)
              .map((s, i) => {
                const frac = s.value / total;
                const len = frac * c;
                const dash = `${len} ${c - len}`;
                const el = (
                  <circle
                    key={i}
                    cx="50"
                    cy="50"
                    r={r}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="12"
                    strokeDasharray={dash}
                    strokeDashoffset={-offset}
                  />
                );
                offset += len;
                return el;
              })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[15px] font-bold leading-none text-foreground">
            {centerValue}
          </div>
          <div className="mt-1 text-[9px] text-surfaceMuted-foreground">{centerLabel}</div>
        </div>
      </div>

      <div className="flex-1 space-y-2">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="flex-1 text-foreground/70">{s.label}</span>
            <span className="font-semibold text-foreground">
              {total > 0 ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
