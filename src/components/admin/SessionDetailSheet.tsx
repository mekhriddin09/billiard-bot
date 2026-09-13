"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { Btn, Input, Row, SectionTitle } from "@/components/ui/bits";
import { useAdminStore } from "@/lib/admin-store";
import { canEditSession } from "@/lib/permissions";
import { fmtDate, fmtDurationMin, fmtHM, fmtMoney } from "@/lib/format";
import { PAYMENT_STATUS_LABELS, ROLE_LABELS } from "@/lib/types";
import type { ClubTable, OrderItem, PaymentMethod, PaymentStatus } from "@/lib/types";

type Mode = "view" | "edit" | "history";

const STATUS_COLOR: Record<PaymentStatus, string> = {
  paid: "text-success",
  partial: "text-warning",
  debt: "text-destructive",
};

function toLocalInput(ts: number) {
  const d = new Date(ts);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fromLocalInput(v: string): number {
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? Date.now() : t;
}

export default function SessionDetailSheet({
  sessionId,
  onClose,
}: {
  sessionId: string | null;
  onClose: () => void;
}) {
  const store = useAdminStore();
  const [mode, setMode] = useState<Mode>("view");
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const session = store.sessions.find((s) => s.id === sessionId);
  const table = store.tables.find((t) => t.id === session?.tableId);

  const handleClose = () => {
    setMode("view");
    setEditingNote(false);
    onClose();
  };

  if (!session || !table) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const canEdit = canEditSession(session, store.currentStaff);
  const isSuper = store.currentStaff.role === "super_admin";
  const minutes = session.endedAt
    ? Math.floor((session.endedAt - session.startedAt) / 60000) + session.adjustMinutes
    : 0;
  const ordersTotal = session.orders.reduce((sum, o) => sum + o.price * o.qty, 0);
  const status: PaymentStatus = session.paymentStatus ?? "paid";

  return (
    <Sheet open={!!sessionId} onClose={handleClose} wide>
      <div className="p-5 pb-8">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-surfaceMuted-foreground">
              Sessiya #{session.id}
            </div>
            <div className="text-2xl font-bold text-foreground">
              {table.type === "tennis" ? "🏓" : "🎱"} Stol {table.name}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-full bg-cardElevated p-2 text-foreground/70 hover:text-foreground"
            aria-label="Yopish"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {mode === "view" && (
          <div>
            <div className="rounded-card border border-edge bg-card p-4">
              <Row label="Boshlangan" value={`${fmtDate(session.startedAt)} ${fmtHM(session.startedAt)}`} />
              <Row
                label="Tugagan"
                value={session.endedAt ? `${fmtDate(session.endedAt)} ${fmtHM(session.endedAt)}` : "—"}
              />
              <Row label="Davomiyligi" value={fmtDurationMin(minutes)} />
            </div>

            <div className="mt-2.5 rounded-card border border-edge bg-card p-4">
              <Row label="Stol" value={`${fmtMoney(session.finalTableCost ?? 0)} so'm`} />
              <Row label="Mahsulotlar" value={`${fmtMoney(ordersTotal)} so'm`} />
              <div className="mt-2 flex items-center justify-between border-t border-edge pt-2.5">
                <span className="text-sm font-bold uppercase tracking-wider">Jami</span>
                <span className="text-xl font-bold text-primary">
                  {fmtMoney(session.finalTotal ?? 0)} so&#39;m
                </span>
              </div>
            </div>

            <div className="mt-2.5 rounded-card border border-edge bg-card p-4">
              <Row
                label="To'lov usuli"
                value={
                  session.paymentMethod === "card"
                    ? "Karta"
                    : session.paymentMethod === "mixed"
                      ? `Aralash (naqd ${fmtMoney(session.cashAmount ?? 0)} + karta ${fmtMoney(session.cardAmount ?? 0)})`
                      : "Naqd"
                }
              />
              <Row
                label="To'lov holati"
                value={<span className={STATUS_COLOR[status]}>{PAYMENT_STATUS_LABELS[status]}</span>}
              />
              {status === "paid" && (
                <Row label="To'langan" value={`${fmtMoney(session.paidAmount ?? session.finalTotal ?? 0)} so'm`} />
              )}
              {(session.debtAmount ?? 0) > 0 && (
                <Row
                  label="Qarz"
                  value={<span className="font-bold text-destructive">{fmtMoney(session.debtAmount ?? 0)} so&#39;m</span>}
                />
              )}
            </div>

            <div className="mb-2 mt-5 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-surfaceMuted-foreground">Izoh</span>
              {canEdit && !editingNote && (
                <button
                  onClick={() => {
                    setNoteDraft(session.note ?? "");
                    setEditingNote(true);
                  }}
                  className="rounded-control bg-primary/12 px-3 py-1.5 text-xs font-semibold text-primary"
                >
                  {session.note ? "Izohni tahrirlash" : "+ Izoh qo'shish"}
                </button>
              )}
            </div>
            {editingNote ? (
              <div>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={3}
                  placeholder="Masalan: Qarzga yopildi, ertaga to'laydi"
                  className="w-full rounded-card border border-edge bg-card px-4 py-3 text-sm text-foreground outline-none placeholder:text-surfaceMuted-foreground/60 focus:border-primary/50"
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Btn
                    variant="primary"
                    onClick={() => {
                      store.setSessionNote(session.id, noteDraft);
                      setEditingNote(false);
                    }}
                  >
                    ✓ Saqlash
                  </Btn>
                  <Btn onClick={() => setEditingNote(false)}>Bekor</Btn>
                </div>
              </div>
            ) : session.note ? (
              <div className="rounded-card border border-edge bg-card p-4 text-sm text-foreground/90">
                &#34;{session.note}&#34;
                <div className="mt-1.5 text-[11px] text-surfaceMuted-foreground">
                  {session.noteBy}
                  {session.noteAt ? ` · ${fmtDate(session.noteAt)} ${fmtHM(session.noteAt)}` : ""}
                </div>
              </div>
            ) : (
              <div className="rounded-card border border-dashed border-edge py-5 text-center text-xs text-surfaceMuted-foreground">
                Izoh yo&#39;q
              </div>
            )}

            <div className="mt-5 rounded-card bg-card px-4 py-3 text-xs leading-relaxed text-surfaceMuted-foreground">
              Yakunlagan: <span className="text-foreground">{session.closedBy ?? "—"}</span>
              {session.closedByRole && (
                <span className="text-primary"> ({ROLE_LABELS[session.closedByRole]})</span>
              )}
              <br />
              Yakunlangan:{" "}
              <span className="text-foreground">
                {session.endedAt ? `${fmtDate(session.endedAt)} ${fmtHM(session.endedAt)}` : "—"}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-2">
              {canEdit ? (
                <Btn variant="gold" onClick={() => setMode("edit")}>
                  {isSuper ? "Tahrirlash" : "Bugungi sessiyani tahrirlash"}
                </Btn>
              ) : (
                <div className="rounded-card border border-edge bg-card px-4 py-3 text-center text-xs text-surfaceMuted-foreground">
                  Faqat bugungi sessiyalar tahrirlanadi. Eski sessiyani faqat Super Admin tuzatishi mumkin.
                </div>
              )}
              {isSuper && (session.editHistory?.length ?? 0) > 0 && (
                <Btn onClick={() => setMode("history")}>
                  O&#39;zgarishlar tarixi ({session.editHistory!.length})
                </Btn>
              )}
            </div>
          </div>
        )}

        {mode === "edit" && (
          <SessionEditForm
            sessionId={session.id}
            initial={session}
            table={table}
            tables={store.tables.filter((t) => !t.archived)}
            onDone={() => setMode("view")}
          />
        )}

        {mode === "history" && (
          <SessionHistory entries={session.editHistory ?? []} onBack={() => setMode("view")} />
        )}
      </div>
    </Sheet>
  );
}

// ─── Tahrirlash formasi ─────────────────────────────────────────────────
function SessionEditForm({
  sessionId,
  initial,
  table,
  tables,
  onDone,
}: {
  sessionId: string;
  initial: {
    tableId: string;
    startedAt: number;
    endedAt?: number;
    paymentMethod?: PaymentMethod;
    paymentStatus?: PaymentStatus;
    paidAmount?: number;
    finalTotal?: number;
    orders: OrderItem[];
  };
  table: ClubTable;
  tables: ClubTable[];
  onDone: () => void;
}) {
  const store = useAdminStore();
  const [tableId, setTableId] = useState(initial.tableId);
  const [startedAt, setStartedAt] = useState(toLocalInput(initial.startedAt));
  const [endedAt, setEndedAt] = useState(toLocalInput(initial.endedAt ?? Date.now()));
  const [method, setMethod] = useState<PaymentMethod>(initial.paymentMethod ?? "cash");
  const [pStatus, setPStatus] = useState<PaymentStatus>(initial.paymentStatus ?? "paid");
  const [paidAmount, setPaidAmount] = useState(
    String(initial.paidAmount ?? initial.finalTotal ?? 0)
  );
  const [orders, setOrders] = useState<OrderItem[]>(initial.orders);
  const [showAdd, setShowAdd] = useState(false);
  const [catId, setCatId] = useState(store.categories[0]?.id ?? "");
  const [reason, setReason] = useState("");

  const bump = (productId: string, delta: number) => {
    setOrders((prev) => {
      const existing = prev.find((o) => o.productId === productId);
      if (existing) {
        return prev
          .map((o) => (o.productId === productId ? { ...o, qty: o.qty + delta } : o))
          .filter((o) => o.qty > 0);
      }
      if (delta <= 0) return prev;
      const p = store.products.find((x) => x.id === productId);
      if (!p) return prev;
      // "id" — bu yerda faqat lokal (correct-orders yuboriladigan) qator,
      // haqiqiy DB id emas; /correct-orders butun ro'yxatni almashtiradi.
      return [...prev, { id: `local-${productId}`, productId, name: p.name, emoji: p.emoji, price: p.price, qty: delta }];
    });
  };

  const canSave = reason.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    const startTs = fromLocalInput(startedAt);
    const endTs = fromLocalInput(endedAt);
    store.correctSession(
      sessionId,
      {
        tableId,
        startedAt: startTs,
        endedAt: endTs,
        paymentMethod: method,
        paymentStatus: pStatus,
        paidAmount: Math.max(0, Number(paidAmount) || 0),
      },
      reason.trim()
    );
    const changed =
      orders.length !== initial.orders.length ||
      orders.some((o) => initial.orders.find((x) => x.productId === o.productId)?.qty !== o.qty);
    if (changed) {
      store.correctSessionOrders(sessionId, orders, reason.trim());
    }
    onDone();
  };

  return (
    <div>
      <div className="rounded-card border border-primary/25 bg-primary/8 px-4 py-3 text-xs leading-relaxed text-primary">
        Har bir o&#39;zgarish audit tarixiga yoziladi: kim, qachon, nima o&#39;zgardi va sabab.
      </div>

      <SectionTitle>Stol</SectionTitle>
      <select
        value={tableId}
        onChange={(e) => setTableId(e.target.value)}
        className="w-full rounded-card border border-edge bg-card px-4 py-3 text-sm text-foreground"
      >
        {tables.map((t) => (
          <option key={t.id} value={t.id}>
            {t.type === "tennis" ? "🏓" : "🎱"} {t.name}
          </option>
        ))}
      </select>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <div className="mb-1 text-[11px] text-surfaceMuted-foreground">Boshlangan</div>
          <input
            type="datetime-local"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
            className="w-full rounded-card border border-edge bg-card px-3 py-2.5 text-sm text-foreground"
          />
        </div>
        <div>
          <div className="mb-1 text-[11px] text-surfaceMuted-foreground">Tugagan</div>
          <input
            type="datetime-local"
            value={endedAt}
            onChange={(e) => setEndedAt(e.target.value)}
            className="w-full rounded-card border border-edge bg-card px-3 py-2.5 text-sm text-foreground"
          />
        </div>
      </div>

      <SectionTitle>Mahsulotlar</SectionTitle>
      {orders.length === 0 ? (
        <div className="rounded-card border border-dashed border-edge py-4 text-center text-xs text-surfaceMuted-foreground">
          Mahsulot yo&#39;q
        </div>
      ) : (
        <div className="space-y-1.5">
          {orders.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between rounded-card border border-edge bg-card px-3.5 py-2"
            >
              <span className="text-sm text-foreground">
                {o.emoji} {o.name}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => bump(o.productId, -1)}
                  className="h-6 w-6 rounded-md bg-cardElevated text-xs text-foreground/70"
                >
                  −
                </button>
                <span className="min-w-[16px] text-center text-sm font-bold text-primary">
                  {o.qty}
                </span>
                <button
                  onClick={() => bump(o.productId, 1)}
                  className="h-6 w-6 rounded-md bg-primary text-xs text-foreground"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={() => setShowAdd((v) => !v)}
        className="mt-2 w-full rounded-control border border-primary/25 py-2 text-xs font-medium text-primary/90"
      >
        {showAdd ? "Yashirish" : "+ Mahsulot qo'shish"}
      </button>
      {showAdd && (
        <div className="mt-2">
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {store.categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCatId(c.id)}
                className={`whitespace-nowrap rounded-control px-3 py-1.5 text-xs font-medium ${
                  catId === c.id ? "bg-primary text-foreground" : "bg-card text-surfaceMuted-foreground"
                }`}
              >
                {c.emoji} {c.name}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {store.products
              .filter((p) => p.categoryId === catId && p.active && p.available)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => bump(p.id, 1)}
                  className="rounded-control border border-edge bg-card px-2 py-2 text-center text-xs text-foreground"
                >
                  <div>{p.emoji}</div>
                  <div className="mt-0.5 truncate">{p.name}</div>
                </button>
              ))}
          </div>
        </div>
      )}

      <SectionTitle>To&#39;lov</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Btn variant={method === "cash" ? "primary" : "ghost"} onClick={() => setMethod("cash")}>
          💵 Naqd
        </Btn>
        <Btn variant={method === "card" ? "primary" : "ghost"} onClick={() => setMethod("card")}>
          💳 Karta
        </Btn>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Btn variant={pStatus === "paid" ? "primary" : "ghost"} onClick={() => setPStatus("paid")}>
          To&#39;landi
        </Btn>
        <Btn variant={pStatus === "partial" ? "gold" : "ghost"} onClick={() => setPStatus("partial")}>
          Qisman
        </Btn>
        <Btn variant={pStatus === "debt" ? "danger" : "ghost"} onClick={() => setPStatus("debt")}>
          Qarz
        </Btn>
      </div>
      {pStatus !== "debt" && (
        <div className="mt-2">
          <Input value={paidAmount} onChange={setPaidAmount} placeholder="To'langan summa" type="number" />
        </div>
      )}

      <SectionTitle>Sabab (majburiy)</SectionTitle>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Masalan: Vaqtni noto'g'ri kiritibman"
        className="w-full rounded-card border border-edge bg-card px-4 py-3 text-sm text-foreground outline-none placeholder:text-surfaceMuted-foreground/60 focus:border-primary/50"
      />

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Btn variant="primary" disabled={!canSave} onClick={save}>
          ✓ Saqlash
        </Btn>
        <Btn onClick={onDone}>Bekor qilish</Btn>
      </div>
      {!canSave && (
        <div className="mt-1.5 text-center text-[11px] text-surfaceMuted-foreground">
          Saqlash uchun sabab yozilishi shart
        </div>
      )}
    </div>
  );
}

// ─── O'zgarishlar tarixi ────────────────────────────────────────────────
function SessionHistory({
  entries,
  onBack,
}: {
  entries: {
    id: string;
    at: number;
    staffName: string;
    role: string;
    field: string;
    oldValue: string;
    newValue: string;
    reason?: string;
  }[];
  onBack: () => void;
}) {
  const sorted = [...entries].sort((a, b) => b.at - a.at);
  return (
    <div>
      <div className="space-y-2">
        {sorted.map((e) => (
          <div key={e.id} className="rounded-card border border-edge bg-card p-3.5">
            <div className="flex items-center justify-between text-xs text-surfaceMuted-foreground">
              <span>
                {fmtDate(e.at)} {fmtHM(e.at)}
              </span>
              <span>
                {e.staffName} · {ROLE_LABELS[e.role as keyof typeof ROLE_LABELS] ?? e.role}
              </span>
            </div>
            <div className="mt-1.5 text-sm text-foreground">
              <b>{e.field}:</b> {e.oldValue} → {e.newValue}
            </div>
            {e.reason && <div className="mt-1 text-xs italic text-surfaceMuted-foreground">&#34;{e.reason}&#34;</div>}
          </div>
        ))}
      </div>
      <div className="mt-4">
        <Btn className="w-full" onClick={onBack}>
          ← Orqaga
        </Btn>
      </div>
    </div>
  );
}
