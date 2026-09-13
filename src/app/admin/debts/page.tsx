"use client";

import { useMemo, useState } from "react";
import { useAdminStore } from "@/lib/admin-store";
import { Card, CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import DebtDetailSheet from "@/components/admin/DebtDetailSheet";
import { fmtDate, fmtMoney, fmtPhone } from "@/lib/format";
import { todayKey } from "@/lib/permissions";
import type { Debt } from "@/lib/types";

type Filter = "open" | "paid";

export default function DebtsPage() {
  const store = useAdminStore();
  const [filter, setFilter] = useState<Filter>("open");
  const [selected, setSelected] = useState<string | null>(null);

  const debts = useMemo(
    () =>
      store.debts
        .filter((d) => d.status === filter)
        .sort((a, b) => b.createdAt - a.createdAt),
    [store.debts, filter]
  );

  const openTotal = useMemo(
    () => store.debts.filter((d) => d.status === "open").reduce((sum, d) => sum + d.remainingAmount, 0),
    [store.debts]
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-foreground">Qarzlar</h1>
        <p className="mt-1 text-[13px] text-surfaceMuted-foreground">Mijozlarning ochiq va yopilgan qarzlari</p>
      </div>

      <div className="mb-4 rounded-card border border-destructive/25 bg-destructive/8 px-4 py-3">
        <div className="text-[11px] uppercase tracking-wider text-destructive/80">Jami ochiq qarz</div>
        <div className="mt-0.5 text-2xl font-bold text-destructive">{fmtMoney(openTotal)} so&#39;m</div>
      </div>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setFilter("open")}
          className={`rounded-card px-3.5 py-2 text-[13px] font-medium transition-colors ${
            filter === "open" ? "bg-primary/70 text-foreground " : "bg-card text-surfaceMuted-foreground"
          }`}
        >
          ⚠️ Ochiq ({store.debts.filter((d) => d.status === "open").length})
        </button>
        <button
          onClick={() => setFilter("paid")}
          className={`rounded-card px-3.5 py-2 text-[13px] font-medium transition-colors ${
            filter === "paid" ? "bg-primary/70 text-foreground " : "bg-card text-surfaceMuted-foreground"
          }`}
        >
          ✅ To&#39;langan
        </button>
      </div>

      <CardHeader title={filter === "open" ? "Ochiq qarzlar" : "To'langan qarzlar"} count={debts.length} />
      {debts.length === 0 ? (
        <Card>
          <EmptyState icon="⚠️" title="Qarz yo'q" />
        </Card>
      ) : (
        <Card padding="none" className="divide-y divide-edge overflow-hidden p-0">
          {debts.map((d) => (
            <DebtRow key={d.id} debt={d} onClick={() => setSelected(d.id)} />
          ))}
        </Card>
      )}

      <DebtDetailSheet debtId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function DebtRow({ debt, onClick }: { debt: Debt; onClick: () => void }) {
  const today = todayKey();
  const overdue = debt.status === "open" && !!debt.dueDate && debt.dueDate < today;
  const dueToday = debt.status === "open" && debt.dueDate === today;

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-cardElevated/50"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-foreground">{debt.customerName}</div>
        <div className="text-xs text-surfaceMuted-foreground">
          {debt.customerPhone ? fmtPhone(debt.customerPhone) : "—"} · {fmtDate(debt.createdAt)}
        </div>
        {debt.dueDate && (
          <div className="mt-1">
            {overdue ? (
              <Badge tone="red">🔴 Muddati o&#39;tgan — {debt.dueDate}</Badge>
            ) : dueToday ? (
              <Badge tone="gold">⚠️ Bugun — {debt.dueDate}</Badge>
            ) : (
              <Badge tone="muted">📅 {debt.dueDate}</Badge>
            )}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className={`text-lg font-bold ${debt.status === "open" ? "text-destructive" : "text-success"}`}>
          {fmtMoney(debt.remainingAmount)} so&#39;m
        </div>
        {debt.paidAmount > 0 && (
          <div className="text-[11px] text-surfaceMuted-foreground">{fmtMoney(debt.paidAmount)} to&#39;langan</div>
        )}
      </div>
    </button>
  );
}
