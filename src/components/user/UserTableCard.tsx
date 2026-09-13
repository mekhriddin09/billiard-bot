"use client";

import { motion } from "framer-motion";
import TableVisual from "@/components/billiard/TableVisual";
import StatusPill from "@/components/user/ui/StatusPill";
import type { ClubTable, TableStatus } from "@/lib/types";
import { fmtMoney } from "@/lib/format";

export default function UserTableCard({
  table,
  status,
  onClick,
}: {
  table: ClubTable;
  status: TableStatus;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 340, damping: 26 }}
      onClick={onClick}
      className="flex flex-col overflow-hidden rounded-card border border-edge bg-card text-left"
    >
      <TableVisual id={table.id} type={table.type} status={status} className="w-full" />
      <div className="px-2.5 pb-2.5 pt-2">
        <div className="text-[15px] font-extrabold leading-none text-foreground">{table.name}</div>
        <div className="mt-1.5">
          <StatusPill status={status} />
        </div>
        <div className="mt-1.5 text-[10.5px] font-bold text-surfaceMuted-foreground">
          {fmtMoney(table.pricePerHour)} so&#39;m/soat
        </div>
      </div>
    </motion.button>
  );
}
