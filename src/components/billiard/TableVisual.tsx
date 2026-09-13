"use client";

// Miniature top-down billiard / tennis table illustration.
// Status communicates itself through the balls, not through color-flooding
// the whole card: racked balls = free/reserved, scattered balls = busy.
// Reserved uses the SAME emerald felt as free — only the card border/badge
// (rendered by the parent card) communicates the champagne "reserved" state.

import type { TableStatus, TableType } from "@/lib/types";

const BALL_COLORS = [
  "#e0b83c", "#2f5aa8", "#b8402d", "#5b3a7a",
  "#c46a26", "#28633c", "#6e2a2f", "#171512",
];

function seedFrom(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h || 1;
}

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Playing surface bounds inside the 100x60 viewBox
const PLAY = { x0: 11.5, y0: 8.5, x1: 88.5, y1: 51.5 };

function rackedBalls() {
  const cx = 58;
  const cy = 30;
  const r = 2.85;
  const rows = [0, 1, 2, 3, 4];
  const balls: { x: number; y: number; color: string }[] = [];
  let i = 0;
  rows.forEach((row) => {
    const count = row + 1;
    const startY = cy - row * (r * 0.98);
    for (let k = 0; k < count; k++) {
      balls.push({
        x: cx + row * (r * 1.7),
        y: startY + k * (r * 1.94),
        color: i === 4 ? "#171512" : BALL_COLORS[i % BALL_COLORS.length],
      });
      i++;
    }
  });
  return { balls, cue: { x: 24, y: 30 } };
}

function scatteredBalls(seed: number) {
  const rnd = mulberry32(seed);
  const balls: { x: number; y: number; color: string }[] = [];
  const count = 5 + Math.floor(rnd() * 4);
  for (let i = 0; i < count; i++) {
    balls.push({
      x: PLAY.x0 + 7 + rnd() * (PLAY.x1 - PLAY.x0 - 14),
      y: PLAY.y0 + 6 + rnd() * (PLAY.y1 - PLAY.y0 - 12),
      color: BALL_COLORS[i % BALL_COLORS.length],
    });
  }
  const cue = {
    x: PLAY.x0 + 7 + rnd() * (PLAY.x1 - PLAY.x0 - 14),
    y: PLAY.y0 + 6 + rnd() * (PLAY.y1 - PLAY.y0 - 12),
  };
  return { balls, cue };
}

// Reserved uses the same emerald felt as free — only the corner badge differs.
const RAIL_TOP: Record<"free" | "active" | "off", string> = {
  free: "#1b2e21", active: "#2c1717", off: "#1b1d18",
};
const RAIL_BOTTOM: Record<"free" | "active" | "off", string> = {
  free: "#0e1a13", active: "#190c0c", off: "#100f0c",
};
const FELT_TOP: Record<"free" | "active" | "off", string> = {
  free: "#125a3a", active: "#3a1717", off: "#20241d",
};
const FELT_BOTTOM: Record<"free" | "active" | "off", string> = {
  free: "#0a3323", active: "#280f0f", off: "#171a14",
};

export default function TableVisual({
  id,
  type,
  status,
  className = "",
}: {
  id: string;
  type: TableType;
  status: TableStatus;
  className?: string;
}) {
  if (type === "tennis") {
    return <TennisVisual status={status} className={className} />;
  }

  const key = status === "off" ? "off" : status === "active" ? "active" : "free";
  const seed = seedFrom(id);
  const { balls, cue } = status === "active" ? scatteredBalls(seed) : rackedBalls();
  const uid = `t-${id}`;

  return (
    <svg viewBox="0 0 100 60" className={className} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={`${uid}-rail`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={RAIL_TOP[key]} />
          <stop offset="100%" stopColor={RAIL_BOTTOM[key]} />
        </linearGradient>
        <linearGradient id={`${uid}-felt`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={FELT_TOP[key]} />
          <stop offset="100%" stopColor={FELT_BOTTOM[key]} />
        </linearGradient>
        <radialGradient id={`${uid}-sheen`} cx="50%" cy="28%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.07" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-vignette`} cx="50%" cy="50%" r="72%">
          <stop offset="55%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
        </radialGradient>
        <radialGradient id={`${uid}-pocket`} cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#2a2a2a" />
          <stop offset="55%" stopColor="#0a0a09" />
          <stop offset="100%" stopColor="#000000" />
        </radialGradient>
      </defs>

      {/* rail / wooden frame with subtle bevel */}
      <rect x="1.2" y="1.2" width="97.6" height="57.6" rx="6" fill={`url(#${uid}-rail)`} />
      <rect
        x="1.2" y="1.2" width="97.6" height="57.6" rx="6"
        fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5"
      />

      {/* felt playing surface */}
      <rect x={PLAY.x0} y={PLAY.y0} width={PLAY.x1 - PLAY.x0} height={PLAY.y1 - PLAY.y0} rx="1.8" fill={`url(#${uid}-felt)`} />
      <rect x={PLAY.x0} y={PLAY.y0} width={PLAY.x1 - PLAY.x0} height={PLAY.y1 - PLAY.y0} rx="1.8" fill={`url(#${uid}-sheen)`} />
      <rect x={PLAY.x0} y={PLAY.y0} width={PLAY.x1 - PLAY.x0} height={PLAY.y1 - PLAY.y0} rx="1.8" fill={`url(#${uid}-vignette)`} />
      <rect
        x={PLAY.x0} y={PLAY.y0} width={PLAY.x1 - PLAY.x0} height={PLAY.y1 - PLAY.y0} rx="1.8"
        fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="0.6"
      />

      {/* pockets */}
      {[
        [PLAY.x0 + 0.6, PLAY.y0 + 0.6],
        [50, PLAY.y0 - 0.6],
        [PLAY.x1 - 0.6, PLAY.y0 + 0.6],
        [PLAY.x0 + 0.6, PLAY.y1 - 0.6],
        [50, PLAY.y1 + 0.6],
        [PLAY.x1 - 0.6, PLAY.y1 - 0.6],
      ].map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r="2.45" fill={`url(#${uid}-pocket)`} />
      ))}

      {/* balls, grounded with a soft contact shadow */}
      {status !== "off" &&
        balls.map((b, i) => (
          <g key={i}>
            <ellipse cx={b.x + 0.3} cy={b.y + 0.9} rx="2.3" ry="0.9" fill="#000" opacity="0.28" />
            <circle cx={b.x} cy={b.y} r="2.5" fill={b.color} stroke="rgba(0,0,0,0.45)" strokeWidth="0.3" />
            <circle cx={b.x - 0.75} cy={b.y - 0.8} r="0.6" fill="#fff" opacity="0.5" />
          </g>
        ))}
      {status !== "off" && (
        <g>
          <ellipse cx={cue.x + 0.3} cy={cue.y + 0.9} rx="2.3" ry="0.9" fill="#000" opacity="0.22" />
          <circle cx={cue.x} cy={cue.y} r="2.5" fill="#efe9d8" stroke="rgba(0,0,0,0.2)" strokeWidth="0.3" />
          <circle cx={cue.x - 0.75} cy={cue.y - 0.8} r="0.6" fill="#fff" opacity="0.75" />
        </g>
      )}
    </svg>
  );
}

function TennisVisual({ status, className }: { status: TableStatus; className?: string }) {
  const key = status === "off" ? "off" : status === "active" ? "active" : "free";
  const court = key === "active" ? "#2a1a1a" : key === "off" ? "#1a1c17" : "#0c3455";
  const line = "rgba(241,238,227,0.45)";

  return (
    <svg viewBox="0 0 100 60" className={className} preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="tennis-vignette" cx="50%" cy="50%" r="72%">
          <stop offset="55%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.3" />
        </radialGradient>
      </defs>
      <rect x="1.2" y="1.2" width="97.6" height="57.6" rx="6" fill="#0d0f0b" />
      <rect x="9" y="7" width="82" height="46" rx="1.4" fill={court} />
      <rect x="9" y="7" width="82" height="46" rx="1.4" fill="url(#tennis-vignette)" />
      <rect x="9" y="7" width="82" height="46" rx="1.4" fill="none" stroke={line} strokeWidth="0.6" />
      <line x1="50" y1="7" x2="50" y2="53" stroke={line} strokeWidth="0.4" opacity="0.65" />
      <line x1="9" y1="30" x2="91" y2="30" stroke="#d9c076" strokeWidth="0.9" opacity="0.85" />
      <rect x="22" y="13" width="56" height="34" fill="none" stroke={line} strokeWidth="0.35" opacity="0.5" />
    </svg>
  );
}
