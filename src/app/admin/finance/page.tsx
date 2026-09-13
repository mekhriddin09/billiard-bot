"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminStore } from "@/lib/admin-store";
import { financeApi, newRequestId, type FinanceSummary } from "@/lib/finance-client";
import { Card, CardHeader } from "@/components/ui/Card";
import KPICard from "@/components/ui/KPICard";
import { Btn, Input, Row, SectionTitle } from "@/components/ui/bits";
import EmptyState from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";
import Sheet from "@/components/ui/Sheet";
import { fmtDate, fmtHM, fmtMoney } from "@/lib/format";
import { todayKey } from "@/lib/permissions";
import type {
  Expense,
  ExpenseCategory,
  PaymentMethod,
  Refund,
  SalaryPayment,
} from "@/lib/types";

// ─── Sana yordamchilari (UI preset'lar uchun — server business_date
// bo'yicha aniq hisoblaydi, bu yerda faqat oraliqni tanlash) ────────────
function addDaysKey(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function monthStartKey(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

type RangePreset = "today" | "week" | "month" | "custom";
const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Bugun",
  week: "So'nggi 7 kun",
  month: "Bu oy",
  custom: "Oraliq",
};

// "Ombor xaridi" tab 2026-08 "Finance Simplification" bilan olib tashlandi
// (CLAUDE.md §4). Backend (`/api/inventory-purchases`, `PurchasesLedger`
// mantig'i) bu yerdan o'chirilmadi — faqat UI'dan yashirildi, chunki klub
// hozircha real ombor/stock boshqaruvi olib bormaydi (§4). Agar kelajakda
// kerak bo'lsa, git tarixidan qaytarish mumkin.
type Tab = "expenses" | "salaries" | "refunds";
const TAB_LABELS: Record<Tab, string> = {
  expenses: "💸 Xarajatlar",
  salaries: "💼 Oylik",
  refunds: "↩️ Qaytarim",
};

const PAYMENT_ICON: Record<PaymentMethod, string> = { cash: "💵 Naqd", card: "💳 Karta", mixed: "💵+💳" };

export default function FinancePage() {
  const store = useAdminStore();
  const isSuper = store.currentStaff.role === "super_admin";

  const [preset, setPreset] = useState<RangePreset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [tab, setTab] = useState<Tab>("expenses");

  const today = todayKey();
  const [from, to] = useMemo(() => {
    switch (preset) {
      case "today":
        return [today, today];
      case "week":
        return [addDaysKey(today, -6), today];
      case "month":
        return [monthStartKey(today), today];
      case "custom":
        return [customFrom || today, customTo || today];
    }
  }, [preset, customFrom, customTo, today]);

  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Sodda model (2026-08 "Finance Simplification"): FOYDA = KELDI − KETDI,
  // COGS'siz — chunki ombor xaridi allaqachon oddiy xarajat (KETDI)
  // sifatida yoziladi. Mavjud `summary.receivedRevenue`/`operatingExpenses`/
  // `salaryExpense` maydonlaridan hisoblanadi — API/finance.ts'ga tegilmadi,
  // bu FAQAT taqdimot (client-side) hisob-kitobi (getSimpleFinanceSummary
  // bilan bir xil formula: finance.ts §6b).
  const simple = summary
    ? {
        received: summary.receivedRevenue.total,
        spent: summary.operatingExpenses + summary.salaryExpense,
        profit: summary.receivedRevenue.total - (summary.operatingExpenses + summary.salaryExpense),
      }
    : null;

  useEffect(() => {
    if (!isSuper) return;
    let cancelled = false;
    financeApi
      .summary(from, to)
      .then((s) => !cancelled && setSummary(s))
      .catch((e) => !cancelled && setSummaryError(e.message));
    return () => {
      cancelled = true;
    };
  }, [isSuper, from, to]);

  if (!isSuper) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <EmptyState icon="🔒" title="Faqat Super Admin uchun" subtitle="Moliya bo'limiga kirish huquqingiz yo'q" />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-foreground">Moliya</h1>
        <p className="mt-1 text-[13px] text-surfaceMuted-foreground">
          Boshqaruv darajasidagi soddalashtirilgan hisob-kitob — to&#39;liq statutory buxgalteriya emas
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(Object.keys(RANGE_LABELS) as RangePreset[]).map((r) => (
          <button
            key={r}
            onClick={() => setPreset(r)}
            className={`whitespace-nowrap rounded-card px-3.5 py-2 text-[13px] font-medium transition-colors ${
              preset === r ? "bg-primary/70 text-foreground" : "bg-card text-surfaceMuted-foreground"
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="mb-5 grid grid-cols-2 gap-2 lg:max-w-md">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-control border border-edge bg-card px-3 py-2.5 text-sm text-foreground"
          />
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-control border border-edge bg-card px-3 py-2.5 text-sm text-foreground"
          />
        </div>
      )}

      {summaryError && (
        <div className="mb-4 rounded-control border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {summaryError}
        </div>
      )}

      {summary && simple && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KPICard icon="💰" tone="green" label="KELDI" value={`${fmtMoney(simple.received)} so'm`} />
            <KPICard icon="💸" tone="muted" label="KETDI" value={`${fmtMoney(simple.spent)} so'm`} />
            <KPICard icon="📈" tone={simple.profit >= 0 ? "green" : "red"} label="FOYDA" value={`${fmtMoney(simple.profit)} so'm`} />
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader title="Naqd/Karta oqimi" />
              <Row label="💵 Naqd kirim" value={`${fmtMoney(summary.cashFlow.cashIn)} so'm`} />
              <Row label="💳 Karta kirim" value={`${fmtMoney(summary.cashFlow.cardIn)} so'm`} />
              <Row label="💵 Naqd chiqim" value={`${fmtMoney(summary.cashFlow.cashOut)} so'm`} />
              <Row label="💳 Karta chiqim" value={`${fmtMoney(summary.cashFlow.cardOut)} so'm`} />
              <div className="mt-2 border-t border-edge pt-2">
                <Row label="Naqd (sof)" value={`${fmtMoney(summary.cashFlow.netCash)} so'm`} accent />
                <Row label="Karta (sof)" value={`${fmtMoney(summary.cashFlow.netCard)} so'm`} accent />
              </div>
              {summary.cashFlow.unsplitMixedDebtPayments > 0 && (
                <div className="mt-2 text-[11px] text-surfaceMuted-foreground">
                  ⚠️ {fmtMoney(summary.cashFlow.unsplitMixedDebtPayments)} so&#39;m aralash usulda to&#39;langan qarz —
                  naqd/karta taqsimoti saqlanmagan, jamiga kirgan.
                </div>
              )}
            </Card>
            <Card>
              <CardHeader title="Ochiq qarz — muddat bo'yicha" />
              <Row label="0–1 kun" value={`${fmtMoney(summary.debtAging.d0_1)} so'm`} />
              <Row label="2–7 kun" value={`${fmtMoney(summary.debtAging.d2_7)} so'm`} />
              <Row label="8–30 kun" value={`${fmtMoney(summary.debtAging.d8_30)} so'm`} />
              <Row label="30+ kun" value={`${fmtMoney(summary.debtAging.d31plus)} so'm`} accent />
              <div className="mt-2 border-t border-edge pt-2">
                <Row label="Jami ochiq qarz" value={`${fmtMoney(summary.debtAging.totalOpen)} so'm`} accent />
              </div>
            </Card>
          </div>
        </>
      )}

      <div className="mb-3 mt-6 flex flex-wrap gap-2">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-card px-3.5 py-2 text-[13px] font-medium transition-colors ${
              tab === t ? "bg-primary/70 text-foreground" : "bg-card text-surfaceMuted-foreground"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "expenses" && <ExpensesLedger from={from} to={to} />}
      {tab === "salaries" && <SalariesLedger from={from} to={to} />}
      {tab === "refunds" && <RefundsLedger from={from} to={to} />}
    </div>
  );
}

// ─── Umumiy: to'lov usuli tanlagich ──────────────────────────────────────
function PaymentMethodPicker({
  method,
  onChange,
  amount,
  cashAmount,
  cardAmount,
  onCashAmount,
  onCardAmount,
}: {
  method: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
  amount: number;
  cashAmount: string;
  cardAmount: string;
  onCashAmount: (v: string) => void;
  onCardAmount: (v: string) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {(["cash", "card", "mixed"] as PaymentMethod[]).map((m) => (
          <Btn key={m} variant={method === m ? "primary" : "ghost"} onClick={() => onChange(m)}>
            {PAYMENT_ICON[m]}
          </Btn>
        ))}
      </div>
      {method === "mixed" && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Input value={cashAmount} onChange={onCashAmount} placeholder="Naqd summa" type="number" />
          <Input value={cardAmount} onChange={onCardAmount} placeholder="Karta summa" type="number" />
        </div>
      )}
      {method === "mixed" && Number(cashAmount || 0) + Number(cardAmount || 0) !== amount && amount > 0 && (
        <div className="mt-1 text-[11px] text-destructive">Naqd+karta yig&#39;indisi jami summaga teng bo&#39;lishi kerak</div>
      )}
    </div>
  );
}

// ─── Umumiy: bekor qilish (reversal) sheet — sabab majburiy (Rule 3) ────
function ReverseSheet({
  open,
  title,
  subtitle,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  return (
    <Sheet open={open} onClose={onCancel}>
      <div className="p-5 pb-8">
        <div className="mb-1 text-lg font-bold text-foreground">{title}</div>
        <div className="mb-4 text-sm text-surfaceMuted-foreground">{subtitle}</div>
        <div className="mb-3 rounded-card border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-[11px] leading-relaxed text-destructive">
          Bu — Rule 3 (o&#39;chirilmaydigan tarix): asl yozuv o&#39;zgarmaydi, teskari ishorali YANGI yozuv qo&#39;shiladi.
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Bekor qilish sababi (majburiy)"
          className="w-full rounded-card border border-edge bg-card px-4 py-3 text-sm text-foreground outline-none placeholder:text-surfaceMuted-foreground/60"
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Btn
            variant="danger"
            disabled={!reason.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "..." : "✓ Bekor qilish"}
          </Btn>
          <Btn onClick={onCancel}>Yopish</Btn>
        </div>
      </div>
    </Sheet>
  );
}

function LedgerRow({
  title,
  subtitle,
  amount,
  meta,
  reversed,
  onReverse,
}: {
  title: string;
  subtitle: string;
  amount: number;
  meta?: string;
  reversed: boolean;
  onReverse: () => void;
}) {
  const isReversal = amount < 0;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-foreground">{title}</div>
        <div className="text-xs text-surfaceMuted-foreground">{subtitle}</div>
        {meta && <div className="mt-0.5 text-[11px] text-surfaceMuted-foreground/80">{meta}</div>}
      </div>
      <div className="shrink-0 text-right">
        <div className={`text-base font-bold ${isReversal ? "text-warning" : "text-foreground"}`}>
          {isReversal ? "−" : ""}
          {fmtMoney(Math.abs(amount))} so&#39;m
        </div>
        {reversed && <Badge tone="muted">Bekor qilingan</Badge>}
        {!reversed && !isReversal && (
          <button onClick={onReverse} className="mt-1 text-[11px] font-medium text-destructive/80 hover:text-destructive">
            Bekor qilish
          </button>
        )}
      </div>
    </div>
  );
}

// ─── 1) XARAJATLAR ───────────────────────────────────────────────────────
function ExpensesLedger({ from, to }: { from: string; to: string }) {
  const [rows, setRows] = useState<Expense[] | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<Expense | null>(null);

  const load = () => {
    financeApi.expenses.list(from, to).then((r) => setRows(r.expenses)).catch((e) => setError(e.message));
  };
  useEffect(load, [from, to]);
  useEffect(() => {
    financeApi.categories.list().then((r) => setCategories(r.categories)).catch(() => {});
  }, []);

  const reversedIds = new Set((rows ?? []).filter((r) => r.reversesId).map((r) => r.reversesId));

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-control border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error}
        </div>
      )}
      <CardHeader
        title="Xarajatlar"
        count={rows?.length ?? 0}
        action={
          <Btn variant="primary" onClick={() => setAddOpen(true)}>
            + Yangi
          </Btn>
        }
      />
      {!rows ? null : rows.length === 0 ? (
        <Card>
          <EmptyState icon="💸" title="Bu oraliqda xarajat yo'q" />
        </Card>
      ) : (
        <Card padding="none" className="divide-y divide-edge overflow-hidden p-0">
          {rows.map((r) => (
            <LedgerRow
              key={r.id}
              title={r.name}
              subtitle={`${fmtDate(r.occurredAt)} ${fmtHM(r.occurredAt)} · ${r.staffName} · ${PAYMENT_ICON[r.paymentMethod]}`}
              meta={r.note}
              amount={r.amount}
              reversed={reversedIds.has(r.id)}
              onReverse={() => setReverseTarget(r)}
            />
          ))}
        </Card>
      )}

      <ExpenseAddSheet
        open={addOpen}
        categories={categories}
        onClose={() => setAddOpen(false)}
        onCategoryAdded={(c) => setCategories((prev) => [...prev, c])}
        onSaved={() => {
          setAddOpen(false);
          load();
        }}
      />

      <ReverseSheet
        open={!!reverseTarget}
        title="Xarajatni bekor qilish"
        subtitle={reverseTarget ? `${reverseTarget.name} — ${fmtMoney(reverseTarget.amount)} so'm` : ""}
        onCancel={() => setReverseTarget(null)}
        onConfirm={async (reason) => {
          if (!reverseTarget) return;
          try {
            await financeApi.expenses.reverse(reverseTarget.id, { reason, clientRequestId: newRequestId() });
            setReverseTarget(null);
            load();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Xatolik");
            setReverseTarget(null);
          }
        }}
      />
    </div>
  );
}

function ExpenseAddSheet({
  open,
  categories,
  onClose,
  onCategoryAdded,
  onSaved,
}: {
  open: boolean;
  categories: ExpenseCategory[];
  onClose: () => void;
  onCategoryAdded: (c: ExpenseCategory) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [showCategory, setShowCategory] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cashAmount, setCashAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [note, setNote] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId());

  useEffect(() => {
    if (open) {
      setName("");
      setAmount("");
      setCategoryId("");
      setShowCategory(false);
      setMethod("cash");
      setCashAmount("");
      setCardAmount("");
      setNote("");
      setNewCatName("");
      setError(null);
      setRequestId(newRequestId());
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const amountNum = Number(amount) || 0;
  const canSave =
    name.trim() &&
    amountNum > 0 &&
    (method !== "mixed" || Number(cashAmount || 0) + Number(cardAmount || 0) === amountNum);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await financeApi.expenses.create({
        clientRequestId: requestId,
        categoryId: categoryId || undefined,
        categoryName: categories.find((c) => c.id === categoryId)?.name,
        name: name.trim(),
        amount: amountNum,
        paymentMethod: method,
        cashAmount: method === "mixed" ? Number(cashAmount) : undefined,
        cardAmount: method === "mixed" ? Number(cardAmount) : undefined,
        note: note.trim() || undefined,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  };

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const { category } = await financeApi.categories.create({ name: newCatName.trim(), emoji: "💸" });
      onCategoryAdded(category);
      setCategoryId(category.id);
      setNewCatName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="p-5 pb-8">
        <div className="mb-4 text-lg font-bold text-foreground">Yangi xarajat</div>

        {error && (
          <div className="mb-3 rounded-control border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            {error}
          </div>
        )}

        <SectionTitle>Nomi va summa</SectionTitle>
        <Input value={name} onChange={setName} placeholder="Masalan: Svet to'lovi" />
        <div className="mt-2">
          <Input value={amount} onChange={setAmount} placeholder="Summa (so'm)" type="number" />
        </div>

        {!showCategory ? (
          <button
            onClick={() => setShowCategory(true)}
            className="mt-2 text-[11px] font-medium text-surfaceMuted-foreground hover:text-foreground"
          >
            + Kategoriya (ixtiyoriy)
          </button>
        ) : (
          <>
            <SectionTitle>Kategoriya (ixtiyoriy)</SectionTitle>
            {categories.length > 0 && (
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-control border border-edge bg-cardElevated px-3 py-3 text-sm text-foreground"
              >
                <option value="">— tanlanmagan —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.name}
                  </option>
                ))}
              </select>
            )}
            <div className="mt-2 flex gap-2">
              <Input value={newCatName} onChange={setNewCatName} placeholder="Yangi kategoriya nomi" />
              <Btn onClick={addCategory}>+</Btn>
            </div>
          </>
        )}

        <SectionTitle>To&#39;lov usuli</SectionTitle>
        <PaymentMethodPicker
          method={method}
          onChange={setMethod}
          amount={amountNum}
          cashAmount={cashAmount}
          cardAmount={cardAmount}
          onCashAmount={setCashAmount}
          onCardAmount={setCardAmount}
        />

        <SectionTitle>Izoh (ixtiyoriy)</SectionTitle>
        <Input value={note} onChange={setNote} placeholder="Izoh" />

        <div className="mt-4">
          <Btn variant="primary" className="w-full" disabled={!canSave || busy} onClick={save}>
            {busy ? "..." : "✓ Saqlash"}
          </Btn>
        </div>
      </div>
    </Sheet>
  );
}

// ─── 2) OYLIK TO'LOVLARI ─────────────────────────────────────────────────
function SalariesLedger({ from, to }: { from: string; to: string }) {
  const store = useAdminStore();
  const [rows, setRows] = useState<SalaryPayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<SalaryPayment | null>(null);

  const load = () => {
    financeApi.salaries.list(from, to).then((r) => setRows(r.payments)).catch((e) => setError(e.message));
  };
  useEffect(load, [from, to]);

  const reversedIds = new Set((rows ?? []).filter((r) => r.reversesId).map((r) => r.reversesId));

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-control border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error}
        </div>
      )}
      <CardHeader
        title="Oylik to'lovlari"
        count={rows?.length ?? 0}
        action={
          <Btn variant="primary" onClick={() => setAddOpen(true)}>
            + Yangi
          </Btn>
        }
      />
      {!rows ? null : rows.length === 0 ? (
        <Card>
          <EmptyState icon="💼" title="Bu oraliqda oylik to'lovi yo'q" />
        </Card>
      ) : (
        <Card padding="none" className="divide-y divide-edge overflow-hidden p-0">
          {rows.map((r) => (
            <LedgerRow
              key={r.id}
              title={r.staffName}
              subtitle={`${r.periodMonth} · ${fmtDate(r.occurredAt)} · to'ladi: ${r.paidByName} · ${PAYMENT_ICON[r.paymentMethod]}`}
              meta={r.note}
              amount={r.amount}
              reversed={reversedIds.has(r.id)}
              onReverse={() => setReverseTarget(r)}
            />
          ))}
        </Card>
      )}

      <SalaryAddSheet
        open={addOpen}
        staff={store.staff}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false);
          load();
        }}
      />

      <ReverseSheet
        open={!!reverseTarget}
        title="Oylik to'lovini bekor qilish"
        subtitle={reverseTarget ? `${reverseTarget.staffName} — ${fmtMoney(reverseTarget.amount)} so'm` : ""}
        onCancel={() => setReverseTarget(null)}
        onConfirm={async (reason) => {
          if (!reverseTarget) return;
          try {
            await financeApi.salaries.reverse(reverseTarget.id, { reason, clientRequestId: newRequestId() });
            setReverseTarget(null);
            load();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Xatolik");
            setReverseTarget(null);
          }
        }}
      />
    </div>
  );
}

function SalaryAddSheet({
  open,
  staff,
  onClose,
  onSaved,
}: {
  open: boolean;
  staff: { id: string; name: string; monthlySalary: number }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = todayKey();
  const [staffId, setStaffId] = useState("");
  const [amount, setAmount] = useState("");
  const [periodMonth, setPeriodMonth] = useState(today.slice(0, 7));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cashAmount, setCashAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId());

  useEffect(() => {
    if (open) {
      setStaffId(staff[0]?.id ?? "");
      setAmount(staff[0] ? String(staff[0].monthlySalary || "") : "");
      setPeriodMonth(today.slice(0, 7));
      setMethod("cash");
      setCashAmount("");
      setCardAmount("");
      setNote("");
      setError(null);
      setRequestId(newRequestId());
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const amountNum = Number(amount) || 0;
  const canSave =
    staffId &&
    amountNum > 0 &&
    /^\d{4}-\d{2}$/.test(periodMonth) &&
    (method !== "mixed" || Number(cashAmount || 0) + Number(cardAmount || 0) === amountNum);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await financeApi.salaries.create({
        clientRequestId: requestId,
        staffId,
        amount: amountNum,
        periodMonth,
        paymentMethod: method,
        cashAmount: method === "mixed" ? Number(cashAmount) : undefined,
        cardAmount: method === "mixed" ? Number(cardAmount) : undefined,
        note: note.trim() || undefined,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="p-5 pb-8">
        <div className="mb-4 text-lg font-bold text-foreground">Yangi oylik to&#39;lovi</div>

        {error && (
          <div className="mb-3 rounded-control border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            {error}
          </div>
        )}

        <SectionTitle>Xodim</SectionTitle>
        <select
          value={staffId}
          onChange={(e) => {
            setStaffId(e.target.value);
            const s = staff.find((x) => x.id === e.target.value);
            if (s) setAmount(String(s.monthlySalary || ""));
          }}
          className="w-full rounded-control border border-edge bg-cardElevated px-3 py-3 text-sm text-foreground"
        >
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <SectionTitle>Davr va summa</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="month"
            value={periodMonth}
            onChange={(e) => setPeriodMonth(e.target.value)}
            className="rounded-control border border-edge bg-cardElevated px-3 py-3 text-sm text-foreground"
          />
          <Input value={amount} onChange={setAmount} placeholder="Summa (so'm)" type="number" />
        </div>

        <SectionTitle>To&#39;lov usuli</SectionTitle>
        <PaymentMethodPicker
          method={method}
          onChange={setMethod}
          amount={amountNum}
          cashAmount={cashAmount}
          cardAmount={cardAmount}
          onCashAmount={setCashAmount}
          onCardAmount={setCardAmount}
        />

        <SectionTitle>Izoh (ixtiyoriy)</SectionTitle>
        <Input value={note} onChange={setNote} placeholder="Izoh" />

        <div className="mt-4">
          <Btn variant="primary" className="w-full" disabled={!canSave || busy} onClick={save}>
            {busy ? "..." : "✓ Saqlash"}
          </Btn>
        </div>
      </div>
    </Sheet>
  );
}

// ─── 4) QAYTARIMLAR ──────────────────────────────────────────────────────
function RefundsLedger({ from, to }: { from: string; to: string }) {
  const [rows, setRows] = useState<Refund[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<Refund | null>(null);

  const load = () => {
    financeApi.refunds.list(from, to).then((r) => setRows(r.refunds)).catch((e) => setError(e.message));
  };
  useEffect(load, [from, to]);

  const reversedIds = new Set((rows ?? []).filter((r) => r.reversesId).map((r) => r.reversesId));

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-control border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error}
        </div>
      )}
      <CardHeader
        title="Qaytarimlar"
        count={rows?.length ?? 0}
        action={
          <Btn variant="primary" onClick={() => setAddOpen(true)}>
            + Yangi
          </Btn>
        }
      />
      {!rows ? null : rows.length === 0 ? (
        <Card>
          <EmptyState icon="↩️" title="Bu oraliqda qaytarim yo'q" />
        </Card>
      ) : (
        <Card padding="none" className="divide-y divide-edge overflow-hidden p-0">
          {rows.map((r) => (
            <LedgerRow
              key={r.id}
              title={r.customerName || "Mijoz"}
              subtitle={`${fmtDate(r.occurredAt)} ${fmtHM(r.occurredAt)} · ${r.staffName} · ${PAYMENT_ICON[r.paymentMethod]}`}
              meta={`Sabab: ${r.reason}`}
              amount={r.amount}
              reversed={reversedIds.has(r.id)}
              onReverse={() => setReverseTarget(r)}
            />
          ))}
        </Card>
      )}

      <RefundAddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false);
          load();
        }}
      />

      <ReverseSheet
        open={!!reverseTarget}
        title="Qaytarimni bekor qilish"
        subtitle={reverseTarget ? `${reverseTarget.customerName ?? "Mijoz"} — ${fmtMoney(reverseTarget.amount)} so'm` : ""}
        onCancel={() => setReverseTarget(null)}
        onConfirm={async (reason) => {
          if (!reverseTarget) return;
          try {
            await financeApi.refunds.reverse(reverseTarget.id, { reason, clientRequestId: newRequestId() });
            setReverseTarget(null);
            load();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Xatolik");
            setReverseTarget(null);
          }
        }}
      />
    </div>
  );
}

function RefundAddSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [customerName, setCustomerName] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cashAmount, setCashAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId());

  useEffect(() => {
    if (open) {
      setCustomerName("");
      setAmount("");
      setReason("");
      setMethod("cash");
      setCashAmount("");
      setCardAmount("");
      setError(null);
      setRequestId(newRequestId());
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const amountNum = Number(amount) || 0;
  const canSave =
    amountNum > 0 && reason.trim() && (method !== "mixed" || Number(cashAmount || 0) + Number(cardAmount || 0) === amountNum);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await financeApi.refunds.create({
        clientRequestId: requestId,
        customerName: customerName.trim() || undefined,
        amount: amountNum,
        reason: reason.trim(),
        paymentMethod: method,
        cashAmount: method === "mixed" ? Number(cashAmount) : undefined,
        cardAmount: method === "mixed" ? Number(cardAmount) : undefined,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="p-5 pb-8">
        <div className="mb-4 text-lg font-bold text-foreground">Yangi qaytarim</div>

        {error && (
          <div className="mb-3 rounded-control border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            {error}
          </div>
        )}

        <SectionTitle>Mijoz (ixtiyoriy)</SectionTitle>
        <Input value={customerName} onChange={setCustomerName} placeholder="Mijoz ismi" />

        <SectionTitle>Summa va sabab</SectionTitle>
        <Input value={amount} onChange={setAmount} placeholder="Summa (so'm)" type="number" />
        <div className="mt-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Sabab (majburiy)"
            className="w-full rounded-card border border-edge bg-card px-4 py-3 text-sm text-foreground outline-none placeholder:text-surfaceMuted-foreground/60"
          />
        </div>

        <SectionTitle>To&#39;lov usuli</SectionTitle>
        <PaymentMethodPicker
          method={method}
          onChange={setMethod}
          amount={amountNum}
          cashAmount={cashAmount}
          cardAmount={cardAmount}
          onCashAmount={setCashAmount}
          onCardAmount={setCardAmount}
        />

        <div className="mt-4">
          <Btn variant="primary" className="w-full" disabled={!canSave || busy} onClick={save}>
            {busy ? "..." : "✓ Saqlash"}
          </Btn>
        </div>
      </div>
    </Sheet>
  );
}
