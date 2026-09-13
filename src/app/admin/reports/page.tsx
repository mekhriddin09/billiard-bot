"use client";

import { useMemo, useState } from "react";
import { useAdminStore } from "@/lib/admin-store";
import { fmtDate, fmtHM, fmtMoney, fmtPhone, pctChange } from "@/lib/format";
import { Btn } from "@/components/ui/bits";
import { Card, CardHeader } from "@/components/ui/Card";
import KPICard from "@/components/ui/KPICard";
import Badge from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import RevenueChart from "@/components/admin/RevenueChart";
import SessionDetailSheet from "@/components/admin/SessionDetailSheet";
import DebtDetailSheet from "@/components/admin/DebtDetailSheet";
import { todayKey } from "@/lib/permissions";
import type { Debt, GameSession, PaymentStatus } from "@/lib/types";
import { PAYMENT_STATUS_LABELS } from "@/lib/types";

const STATUS_TONE: Record<PaymentStatus, BadgeTone> = {
  paid: "green",
  partial: "gold",
  debt: "red",
};

type Range = "today" | "yesterday" | "week" | "month" | "custom";

const RANGE_LABELS: Record<Range, string> = {
  today: "Bugun",
  yesterday: "Kecha",
  week: "Bu hafta",
  month: "Bu oy",
  custom: "Oraliq",
};

function dayStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

type View = "stats" | "debts";

export default function ReportsPage() {
  const store = useAdminStore();
  const [view, setView] = useState<View>("stats");
  const [range, setRange] = useState<Range>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [debtFilter, setDebtFilter] = useState<"open" | "paid">("open");
  const [selectedDebt, setSelectedDebt] = useState<string | null>(null);

  const [start, end] = useMemo(() => {
    const now = new Date();
    switch (range) {
      case "today":
        return [dayStart(now), now.getTime()];
      case "yesterday": {
        const y = dayStart(now) - 86400000;
        return [y, dayStart(now)];
      }
      case "week": {
        const d = new Date(now);
        const dow = (d.getDay() + 6) % 7;
        return [dayStart(new Date(d.getTime() - dow * 86400000)), now.getTime()];
      }
      case "month": {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        return [d.getTime(), now.getTime()];
      }
      case "custom": {
        const f = from ? new Date(from).getTime() : dayStart(now);
        const t = to ? new Date(to).getTime() + 86400000 : now.getTime();
        return [f, t];
      }
    }
  }, [range, from, to]);

  const closedIn = (a: number, b: number) =>
    store.sessions.filter(
      (s): s is GameSession & { endedAt: number } =>
        s.status === "closed" && (s.endedAt ?? 0) >= a && (s.endedAt ?? 0) < b
    );

  const closed = useMemo(() => closedIn(start, end), [store.sessions, start, end]);
  const prevClosed = useMemo(() => {
    const span = end - start;
    return closedIn(start - span, start);
  }, [store.sessions, start, end]);

  function summarize(list: GameSession[]) {
    let minutes = 0;
    let revenue = 0;
    for (const s of list) {
      revenue += s.finalTotal ?? 0;
      minutes += Math.floor(((s.endedAt ?? 0) - s.startedAt) / 60000);
    }
    return {
      revenue,
      minutes,
      sessions: list.length,
      avgCheck: list.length ? Math.round(revenue / list.length) : 0,
    };
  }

  const cur = summarize(closed);
  const prev = summarize(prevClosed);

  const stats = useMemo(() => {
    let billiardRev = 0;
    let tennisRev = 0;
    let foodRev = 0;
    let drinkRev = 0;
    const customers = new Set<string>();

    for (const s of closed) {
      const table = store.tables.find((t) => t.id === s.tableId);
      const tc = s.finalTableCost ?? 0;
      if (table?.type === "tennis") tennisRev += tc;
      else billiardRev += tc;
      for (const o of s.orders) {
        const p = store.products.find((x) => x.id === o.productId);
        const sum = o.price * o.qty;
        if (p?.categoryId === "food") foodRev += sum;
        else drinkRev += sum;
      }
      if (s.customerId) customers.add(s.customerId);
    }
    return { billiardRev, tennisRev, foodRev, drinkRev, customers: customers.size };
  }, [closed, store.tables, store.products]);

  const perTable = useMemo(() => {
    const map = new Map<string, { minutes: number; sessions: number; revenue: number }>();
    for (const s of closed) {
      const c = map.get(s.tableId) ?? { minutes: 0, sessions: 0, revenue: 0 };
      c.minutes += Math.floor(((s.endedAt ?? 0) - s.startedAt) / 60000);
      c.sessions += 1;
      c.revenue += s.finalTotal ?? 0;
      map.set(s.tableId, c);
    }
    return store.tables
      .filter((t) => !t.archived)
      .map((t) => ({ table: t, ...(map.get(t.id) ?? { minutes: 0, sessions: 0, revenue: 0 }) }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [closed, store.tables]);
  const maxTableRevenue = Math.max(1, ...perTable.map((r) => r.revenue));

  // Chart buckets: hourly if range <= 1 day, otherwise daily
  const chart = useMemo(() => {
    const spanDays = (end - start) / 86400000;
    if (spanDays <= 1.5) {
      const buckets = Array.from({ length: 25 }, () => 0);
      for (const s of closed) {
        const h = new Date(s.endedAt).getHours();
        buckets[h] += s.finalTotal ?? 0;
      }
      return {
        points: buckets.slice(0, 24),
        labels: ["00:00", "06:00", "12:00", "18:00", "24:00"],
      };
    }
    const days = Math.max(1, Math.min(31, Math.round(spanDays)));
    const buckets = Array.from({ length: days }, () => 0);
    for (const s of closed) {
      const idx = Math.min(days - 1, Math.floor((s.endedAt - start) / 86400000));
      if (idx >= 0) buckets[idx] += s.finalTotal ?? 0;
    }
    const fmt = (i: number) =>
      new Date(start + i * 86400000).toLocaleDateString("uz", { day: "2-digit", month: "2-digit" });
    const labelIdx = [0, Math.floor(days / 2), days - 1].filter((v, i, a) => a.indexOf(v) === i);
    return { points: buckets, labels: labelIdx.map(fmt) };
  }, [closed, start, end]);

  const exportCSV = () => {
    const rows = [
      ["Sana", "Stol", "Boshlangan", "Tugagan", "Daqiqa", "Stol summa", "Jami", "To'lov"],
      ...closed.map((s) => {
        const t = store.tables.find((x) => x.id === s.tableId);
        const d = new Date(s.startedAt);
        return [
          d.toLocaleDateString("uz"),
          t?.name ?? s.tableId,
          new Date(s.startedAt).toLocaleTimeString("uz", { hour: "2-digit", minute: "2-digit" }),
          new Date(s.endedAt ?? 0).toLocaleTimeString("uz", { hour: "2-digit", minute: "2-digit" }),
          String(Math.floor(((s.endedAt ?? 0) - s.startedAt) / 60000)),
          String(s.finalTableCost ?? 0),
          String(s.finalTotal ?? 0),
          s.paymentMethod === "card" ? "karta" : s.paymentMethod === "mixed" ? "aralash" : "naqd",
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hisobot-${RANGE_LABELS[range]}.csv`;
    a.click();
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Hisobotlar</h1>
          <p className="mt-1 text-[13px] text-surfaceMuted-foreground">Moliyaviy tahlil va stol samaradorligi</p>
        </div>
        {view === "stats" && (
          <Btn variant="gold" onClick={exportCSV}>⬇ Export</Btn>
        )}
      </div>

      <div className="mb-5 flex gap-2">
        <button
          onClick={() => setView("stats")}
          className={`rounded-card px-3.5 py-2 text-[13px] font-medium transition-colors ${
            view === "stats" ? "bg-primary/70 text-foreground" : "bg-card text-surfaceMuted-foreground"
          }`}
        >
          📊 Statistika
        </button>
        <button
          onClick={() => setView("debts")}
          className={`rounded-card px-3.5 py-2 text-[13px] font-medium transition-colors ${
            view === "debts" ? "bg-primary/70 text-foreground" : "bg-card text-surfaceMuted-foreground"
          }`}
        >
          ⚠️ Qarzlar{store.debts.filter((d) => d.status === "open").length > 0 ? ` (${store.debts.filter((d) => d.status === "open").length})` : ""}
        </button>
      </div>

      {view === "debts" && (
        <DebtsView filter={debtFilter} setFilter={setDebtFilter} onSelect={setSelectedDebt} />
      )}

      {view === "stats" && (
      <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`whitespace-nowrap rounded-card px-3.5 py-2 text-[13px] font-medium transition-colors ${
                range === r ? "bg-primary/70 text-foreground " : "bg-card text-surfaceMuted-foreground"
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {range === "custom" && (
        <div className="mb-5 grid grid-cols-2 gap-2 lg:max-w-md">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-control border border-edge bg-card px-3 py-2.5 text-sm text-foreground"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-control border border-edge bg-card px-3 py-2.5 text-sm text-foreground"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard
          icon="💰"
          tone="green"
          label="Umumiy tushum"
          value={`${fmtMoney(cur.revenue)} so'm`}
          pct={pctChange(cur.revenue, prev.revenue)}
        />
        <KPICard
          icon="⏱️"
          tone="gold"
          label="O'yin vaqti"
          value={`${Math.floor(cur.minutes / 60)}s ${cur.minutes % 60}d`}
          pct={pctChange(cur.minutes, prev.minutes)}
        />
        <KPICard
          icon="🧾"
          tone="blue"
          label="O'yinlar soni"
          value={String(cur.sessions)}
          pct={pctChange(cur.sessions, prev.sessions)}
        />
        <KPICard
          icon="🧮"
          tone="purple"
          label="O'rtacha chek"
          value={`${fmtMoney(cur.avgCheck)} so'm`}
          pct={pctChange(cur.avgCheck, prev.avgCheck)}
        />
      </div>

      <Card className="mt-4">
        <CardHeader title="Tushum grafigi" />
        {cur.revenue > 0 ? (
          <RevenueChart points={chart.points} labels={chart.labels} />
        ) : (
          <EmptyState icon="📈" title="Bu oraliqda tushum yo'q" />
        )}
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat icon="🎱" label="Billiard" value={`${fmtMoney(stats.billiardRev)} so'm`} />
        <MiniStat icon="🏓" label="Tennis" value={`${fmtMoney(stats.tennisRev)} so'm`} />
        <MiniStat icon="🍗" label="Taomlar" value={`${fmtMoney(stats.foodRev)} so'm`} />
        <MiniStat icon="🥤" label="Ichimlik/gazak" value={`${fmtMoney(stats.drinkRev)} so'm`} />
      </div>

      <Card padding="none" className="mt-6 overflow-hidden p-0">
        <div className="p-4 pb-0 sm:p-5 sm:pb-0">
          <CardHeader title="Stol analitikasi" />
        </div>
        {perTable.map((row, i) => (
          <div
            key={row.table.id}
            className={`flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5 ${
              i !== perTable.length - 1 ? "border-b border-edge" : ""
            }`}
          >
            <span className="w-12 shrink-0 font-semibold text-foreground">{row.table.name}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cardElevated">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary"
                style={{ width: `${row.revenue > 0 ? Math.max(6, (row.revenue / maxTableRevenue) * 100) : 0}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-surfaceMuted-foreground">{Math.round(row.minutes / 60)}s</span>
            <span className="w-20 shrink-0 text-right text-surfaceMuted-foreground">{row.sessions} sessiya</span>
            <span className="w-24 shrink-0 text-right font-semibold text-primary">
              {fmtMoney(row.revenue)}
            </span>
          </div>
        ))}
      </Card>

      <Card padding="none" className="mt-6 overflow-hidden p-0">
        <div className="flex items-center justify-between p-4 pb-0 sm:p-5 sm:pb-0">
          <CardHeader title="Barcha sessiyalar" count={`${closed.length} ta`} />
        </div>
        {closed.length === 0 ? (
          <div className="p-4 sm:p-5">
            <EmptyState icon="🎱" title="Bu oraliqda sessiya yo'q" />
          </div>
        ) : (
          [...closed]
            .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
            .map((s, i, arr) => {
              const t = store.tables.find((x) => x.id === s.tableId);
              const status: PaymentStatus = s.paymentStatus ?? "paid";
              const durMin = Math.floor(((s.endedAt ?? 0) - s.startedAt) / 60000);
              const customer = store.customers.find((c) => c.id === s.customerId);
              const orderCount = s.orders.reduce((n, o) => n + o.qty, 0);
              return (
                <button
                  key={s.id}
                  onClick={() => setOpenSessionId(s.id)}
                  className={`flex w-full flex-col gap-1 px-4 py-3 text-left text-sm transition-colors hover:bg-cardElevated/60 sm:flex-row sm:items-center sm:gap-3 sm:px-5 ${
                    i !== arr.length - 1 ? "border-b border-edge" : ""
                  }`}
                >
                  <span className="flex items-center gap-2 sm:w-16 sm:shrink-0">
                    <span className="font-semibold text-foreground">{t?.name ?? s.tableId}</span>
                    {t?.type === "tennis" && <span className="text-xs">🏓</span>}
                  </span>
                  <span className="shrink-0 text-xs text-surfaceMuted-foreground sm:w-32">
                    {fmtDate(s.startedAt)} {fmtHM(s.startedAt)}–{s.endedAt ? fmtHM(s.endedAt) : "—"}
                  </span>
                  <span className="shrink-0 text-xs text-surfaceMuted-foreground sm:w-20">{durMin} daqiqa</span>
                  <span className="flex-1 truncate text-xs text-surfaceMuted-foreground">
                    {customer ? customer.name : "Mijozsiz"}
                    {orderCount > 0 ? ` · ${orderCount} mahsulot` : ""}
                    {s.note ? " · izohli" : ""}
                  </span>
                  <span className="shrink-0 text-xs text-surfaceMuted-foreground sm:w-14">
                    {s.paymentMethod === "card" ? "💳 Karta" : s.paymentMethod === "mixed" ? "💵+💳" : "💵 Naqd"}
                  </span>
                  <span className="shrink-0 font-semibold text-primary sm:w-24 sm:text-right">
                    {fmtMoney(s.finalTotal ?? 0)}
                  </span>
                  <span className="shrink-0 self-start sm:w-28 sm:self-auto sm:text-right">
                    <Badge tone={STATUS_TONE[status]}>
                      {PAYMENT_STATUS_LABELS[status]}
                      {(s.debtAmount ?? 0) > 0 ? ` · ${fmtMoney(s.debtAmount ?? 0)}` : ""}
                    </Badge>
                  </span>
                </button>
              );
            })
        )}
      </Card>
      </>
      )}

      <SessionDetailSheet sessionId={openSessionId} onClose={() => setOpenSessionId(null)} />
      <DebtDetailSheet debtId={selectedDebt} onClose={() => setSelectedDebt(null)} />
    </div>
  );
}

/** Qarzlar — ilgari alohida /admin/debts sahifasi edi, endi shu yerda tab sifatida
 *  (navigatsiya soddalashtirildi, lekin funksionallik o'zgarmadi — har qanday
 *  faol xodim ko'ra/to'lov qayd eta oladi, faqat tuzatish Super Admin). */
function DebtsView({
  filter,
  setFilter,
  onSelect,
}: {
  filter: "open" | "paid";
  setFilter: (f: "open" | "paid") => void;
  onSelect: (id: string) => void;
}) {
  const store = useAdminStore();
  const debts = useMemo(
    () => store.debts.filter((d) => d.status === filter).sort((a, b) => b.createdAt - a.createdAt),
    [store.debts, filter]
  );
  const openTotal = useMemo(
    () => store.debts.filter((d) => d.status === "open").reduce((sum, d) => sum + d.remainingAmount, 0),
    [store.debts]
  );

  return (
    <div className="mb-6">
      <div className="mb-4 rounded-card border border-destructive/25 bg-destructive/8 px-4 py-3">
        <div className="text-[11px] uppercase tracking-wider text-destructive/80">Jami ochiq qarz</div>
        <div className="mt-0.5 text-2xl font-bold text-destructive">{fmtMoney(openTotal)} so&#39;m</div>
      </div>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setFilter("open")}
          className={`rounded-card px-3.5 py-2 text-[13px] font-medium transition-colors ${
            filter === "open" ? "bg-primary/70 text-foreground" : "bg-card text-surfaceMuted-foreground"
          }`}
        >
          ⚠️ Ochiq ({store.debts.filter((d) => d.status === "open").length})
        </button>
        <button
          onClick={() => setFilter("paid")}
          className={`rounded-card px-3.5 py-2 text-[13px] font-medium transition-colors ${
            filter === "paid" ? "bg-primary/70 text-foreground" : "bg-card text-surfaceMuted-foreground"
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
            <DebtRow key={d.id} debt={d} onClick={() => onSelect(d.id)} />
          ))}
        </Card>
      )}
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

function MiniStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <Card padding="sm" className="py-3">
      <div className="flex items-center gap-2 text-[11px] text-surfaceMuted-foreground">
        <span>{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-base font-bold text-foreground">{value}</div>
    </Card>
  );
}
