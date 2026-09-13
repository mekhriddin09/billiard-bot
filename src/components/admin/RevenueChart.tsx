"use client";

import { fmtCompact, fmtMoney } from "@/lib/format";

// Real bar chart with y-axis gridlines and a peak callout — the reference's
// chart is a substantial data visualization, not a decorative sparkline.
export default function RevenueChart({
  points,
  labels,
}: {
  points: number[];
  labels: string[];
}) {
  const W = 300;
  const H = 150;
  const X0 = 4;
  const X1 = 296;
  const Y0 = 22;
  const Y1 = 118;
  const XLABEL_Y = 134;

  const max = Math.max(1, ...points);
  const n = points.length;
  const slot = (X1 - X0) / n;
  const barW = Math.max(1.5, slot * 0.5);

  const peakIdx = points.reduce((best, v, i) => (v > points[best] ? i : best), 0);
  const peakX = X0 + slot * peakIdx + slot / 2;
  const peakY = Y1 - (points[peakIdx] / max) * (Y1 - Y0);

  const gridFracs = [0, 1 / 3, 2 / 3, 1];

  const labelPositions =
    labels.length > 1
      ? labels.map((lab, i) => {
          const idx = Math.round((i / (labels.length - 1)) * (n - 1));
          return { lab, x: X0 + slot * idx + slot / 2 };
        })
      : [];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 168 }}>
      <defs>
        <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4f97f2" />
          <stop offset="100%" stopColor="#1f5cb8" />
        </linearGradient>
      </defs>

      {/* y-axis gridlines + compact value labels */}
      {gridFracs.map((f) => {
        const y = Y1 - f * (Y1 - Y0);
        return (
          <g key={f}>
            <line x1={X0} x2={X1} y1={y} y2={y} stroke="rgb(var(--foreground) / 0.06)" strokeWidth="1" />
            <text x={X0} y={y - 3} fontSize="7.5" fill="rgb(var(--foreground) / 0.4)">
              {f === 0 ? "0" : fmtCompact(Math.round(max * f))}
            </text>
          </g>
        );
      })}

      {/* bars */}
      {points.map((p, i) => {
        const h = (p / max) * (Y1 - Y0);
        const x = X0 + slot * i + (slot - barW) / 2;
        const y = Y1 - h;
        const isPeak = i === peakIdx && p > 0;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={Math.max(0, h)}
            rx={Math.min(2.5, barW / 2)}
            fill={isPeak ? "#6cabf5" : "url(#barFill)"}
            opacity={isPeak ? 1 : 0.85}
          />
        );
      })}

      {/* peak callout bubble */}
      {points[peakIdx] > 0 && (
        <g transform={`translate(${Math.min(Math.max(peakX, X0 + 20), X1 - 20)}, ${Math.max(Y0 - 4, peakY - 14)})`}>
          <rect x={-22} y={-11} width={44} height={14} rx={5} fill="#0f1b2e" stroke="rgba(108,171,245,0.4)" strokeWidth="0.6" />
          <text x={0} y={-1.5} fontSize="6.5" fontWeight="700" fill="#6cabf5" textAnchor="middle">
            {fmtMoney(points[peakIdx])}
          </text>
        </g>
      )}

      {/* x-axis labels */}
      {labelPositions.map(({ lab, x }, i) => (
        <text
          key={i}
          x={Math.min(Math.max(x, X0 + 10), X1 - 10)}
          y={XLABEL_Y}
          fontSize="7.5"
          fill="rgb(var(--foreground) / 0.45)"
          textAnchor="middle"
        >
          {lab}
        </text>
      ))}
    </svg>
  );
}
