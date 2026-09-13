"use client";

import { motion } from "framer-motion";
import type { ClubTable, GameSession, Reservation, TableStatus } from "@/lib/types";
import { sessionMinutes, tableCost } from "@/lib/calc";
import { fmtHM, fmtMoney, fmtTimer } from "@/lib/format";
import TableVisual from "@/components/billiard/TableVisual";
import StatusCorner from "@/components/billiard/StatusCorner";

// Whole-card atmosphere per status — the reference tints the card body
// itself, not just the felt illustration, so the grid reads as color-coded
// at a glance even before you look at the mini table.
const TINT: Record<TableStatus, string> = {
  free: "bg-gradient-to-b from-success/[0.09] to-card",
  active: "bg-gradient-to-b from-destructive/[0.11] to-card",
  reserved: "bg-gradient-to-b from-warning/[0.1] to-card",
  off: "bg-card",
};

// Hairline only — status is read from the tint/dot/badge, not a colored outline.
const BORDER: Record<TableStatus, string> = {
  free: "border-edge",
  active: "border-edge",
  reserved: "border-edge",
  off: "border-edge",
};

const LABEL: Record<TableStatus, string> = {
  free: "Bo'sh",
  active: "O'yinda",
  reserved: "Saqlangan",
  off: "Yopiq",
};

const DOT: Record<TableStatus, string> = {
  free: "bg-success",
  active: "bg-destructive",
  reserved: "bg-warning",
  off: "bg-surfaceMuted-foreground",
};

const TEXT: Record<TableStatus, string> = {
  free: "text-success",
  active: "text-destructive",
  reserved: "text-warning",
  off: "text-surfaceMuted-foreground",
};

export default function TableCard({
  table,
  status,
  session,
  reservation,
  now,
  onClick,
}: {
  table: ClubTable;
  status: TableStatus;
  session?: GameSession;
  reservation?: Reservation;
  now: number;
  onClick: () => void;
}) {
  const cost = session
    ? tableCost(sessionMinutes(session, now), table.pricePerHour)
    : 0;

  return (
    <motion.button
      layout
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 340, damping: 26 }}
      onClick={onClick}
      className={`flex flex-col overflow-hidden rounded-card border text-left transition-colors hover:border-edgeStrong ${TINT[status]} ${BORDER[status]}`}
    >
      <div className="relative">
        <TableVisual id={table.id} type={table.type} status={status} className="w-full" />
        <StatusCorner status={status} />
        {table.tier === "vip" && (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-secondary/25 px-1.5 py-[2px] text-[7px] font-bold tracking-wider text-secondary">
            VIP
          </span>
        )}
      </div>

      <div className="px-3 pb-3 pt-2.5">
        <div className="text-[16px] font-bold leading-none text-foreground">
          {table.name}
        </div>
        <div className={`mt-2 flex items-center gap-1.5 text-[10.5px] font-semibold ${TEXT[status]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} />
          {LABEL[status]}
        </div>

        {status === "active" && session && (
          <div className="mt-2 tabular text-[14px] font-bold text-destructive">
            {fmtTimer(now - session.startedAt + session.adjustMinutes * 60000)}
          </div>
        )}
        {status === "active" && session && (
          <div className="mt-0.5 text-[10px] font-medium text-foreground/60">{fmtMoney(cost)} so&#39;m</div>
        )}

        {status === "reserved" && reservation && (
          <div className="mt-1.5 text-[10px] text-surfaceMuted-foreground">
            {fmtHM(reservation.holdUntil)} gacha &middot; {fmtMoney(reservation.deposit)}
          </div>
        )}

        {(status === "free" || status === "off") && (
          <div className="mt-1.5 text-[10px] text-surfaceMuted-foreground">
            {fmtMoney(table.pricePerHour)} so&#39;m/soat
          </div>
        )}
      </div>
    </motion.button>
  );
}
