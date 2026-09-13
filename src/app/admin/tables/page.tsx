"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import TableCard from "@/components/admin/TableCard";
import TableDetailSheet from "@/components/admin/TableDetailSheet";
import { Card, CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { useAdminNow, useAdminStore } from "@/lib/admin-store";
import { fmtDurationMin, fmtMoney } from "@/lib/format";
import type { TableStatus } from "@/lib/types";

export default function AdminTablesPage() {
  const store = useAdminStore();
  const now = useAdminNow(1000);
  const [selected, setSelected] = useState<string | null>(null);

  const visibleTables = store.tables.filter((t) => !t.archived);
  const billiard = visibleTables.filter((t) => t.type === "billiard");
  const tennis = visibleTables.filter((t) => t.type === "tennis");

  const statusOf = (tableId: string): TableStatus => {
    const t = store.tables.find((x) => x.id === tableId)!;
    if (!t.enabled) return "off";
    if (store.sessions.some((s) => s.tableId === tableId && s.status === "active"))
      return "active";
    if (
      store.reservations.some(
        (r) => r.tableId === tableId && r.status === "held" && r.holdUntil > now
      )
    )
      return "reserved";
    return "free";
  };

  const counts = useMemo(() => {
    const c = { free: 0, active: 0, reserved: 0 };
    for (const t of visibleTables) {
      const s = statusOf(t.id);
      if (s === "free") c.free++;
      else if (s === "active") c.active++;
      else if (s === "reserved") c.reserved++;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTables, store.sessions, store.reservations, now]);

  const today = useMemo(() => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const closed = store.sessions.filter(
      (s) => s.status === "closed" && (s.endedAt ?? 0) >= start.getTime()
    );
    const revenue = closed.reduce((sum, s) => sum + (s.finalTotal ?? 0), 0);
    const minutes = closed.reduce(
      (sum, s) => sum + Math.floor(((s.endedAt ?? 0) - s.startedAt) / 60000),
      0
    );
    return {
      revenue,
      games: closed.length,
      avgMin: closed.length ? Math.round(minutes / closed.length) : 0,
    };
  }, [store.sessions, now]);

  const sessionFor = (tableId: string) =>
    store.sessions.find((s) => s.tableId === tableId && s.status === "active");
  const reservationFor = (tableId: string) =>
    store.reservations.find(
      (r) => r.tableId === tableId && r.status === "held" && r.holdUntil > now
    );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Stollar</h1>
          <p className="mt-0.5 text-[12.5px] text-surfaceMuted-foreground">
            {visibleTables.length} ta stol — real vaqtda holat va boshqaruv
          </p>
        </div>
        <Link
          href="/admin/settings"
          className="rounded-card border border-primary/25 px-3.5 py-2.5 text-[12.5px] font-semibold text-primary/90 transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          + Stol qo&#39;shish
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone="green" dot>
          {counts.free} Bo&#39;sh
        </Badge>
        <Badge tone="red" dot>
          {counts.active} O&#39;yinda
        </Badge>
        <Badge tone="gold" dot>
          {counts.reserved} Saqlangan
        </Badge>
        <Badge tone="blue" dot>
          {tennis.length} Tennis
        </Badge>
      </div>

      <CardHeader title="Billiard stollar" count={billiard.length} />
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {billiard.map((t) => (
          <TableCard
            key={t.id}
            table={t}
            status={statusOf(t.id)}
            session={sessionFor(t.id)}
            reservation={reservationFor(t.id)}
            now={now}
            onClick={() => setSelected(t.id)}
          />
        ))}
      </div>

      {tennis.length > 0 && (
        <>
          <div className="mt-8">
            <CardHeader title="Tennis stollar" count={tennis.length} />
          </div>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {tennis.map((t) => (
              <TableCard
                key={t.id}
                table={t}
                status={statusOf(t.id)}
                session={sessionFor(t.id)}
                reservation={reservationFor(t.id)}
                now={now}
                onClick={() => setSelected(t.id)}
              />
            ))}
          </div>
        </>
      )}

      <div className="mt-8 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat label="Bugungi tushum" value={`${fmtMoney(today.revenue)} so'm`} />
        <Stat label="O'yinlar soni" value={String(today.games)} />
        <Stat label="O'rtacha vaqt" value={fmtDurationMin(today.avgMin)} />
        <Stat label="Bo'sh stollar" value={`${counts.free} / ${visibleTables.length}`} />
      </div>

      <TableDetailSheet tableId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card padding="sm" className="py-3.5">
      <div className="text-[11px] text-surfaceMuted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold text-foreground">{value}</div>
    </Card>
  );
}
