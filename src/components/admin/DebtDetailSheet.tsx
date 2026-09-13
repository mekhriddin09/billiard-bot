"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { Btn, Input, Row, SectionTitle } from "@/components/ui/bits";
import { useAdminStore } from "@/lib/admin-store";
import { fmtDate, fmtHM, fmtMoney, fmtPhone } from "@/lib/format";
import type { PaymentMethod } from "@/lib/types";

export default function DebtDetailSheet({
  debtId,
  onClose,
}: {
  debtId: string | null;
  onClose: () => void;
}) {
  const store = useAdminStore();
  const debt = store.debts.find((d) => d.id === debtId);
  const isSuper = store.currentStaff.role === "super_admin";

  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [payNote, setPayNote] = useState("");
  const [editingDue, setEditingDue] = useState(false);
  const [dueDraft, setDueDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [showCorrect, setShowCorrect] = useState(false);
  const [correctAmount, setCorrectAmount] = useState("");
  const [correctReason, setCorrectReason] = useState("");

  const handleClose = () => {
    setPayAmount("");
    setPayNote("");
    setEditingDue(false);
    setEditingNote(false);
    setShowCorrect(false);
    onClose();
  };

  if (!debt) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const table = store.tables.find((t) => t.id === debt.tableId);

  return (
    <Sheet open={!!debtId} onClose={handleClose}>
      <div className="p-5 pb-8">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-surfaceMuted-foreground">
              {debt.status === "paid" ? "✅ To'langan qarz" : "⚠️ Ochiq qarz"}
            </div>
            <div className="text-2xl font-bold text-foreground">{debt.customerName}</div>
            {debt.customerPhone && <div className="mt-0.5 text-xs text-surfaceMuted-foreground">{fmtPhone(debt.customerPhone)}</div>}
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

        <div className="rounded-card border border-edge bg-card p-4">
          {table && <Row label="Stol" value={`${table.type === "tennis" ? "🏓" : "🎱"} ${table.name}`} />}
          <Row label="Asl summa" value={`${fmtMoney(debt.originalAmount)} so'm`} />
          <Row label="To'langan" value={`${fmtMoney(debt.paidAmount)} so'm`} />
          <div className="mt-2 flex items-center justify-between border-t border-edge pt-2.5">
            <span className="text-sm font-bold uppercase tracking-wider">Qoldi</span>
            <span
              className={`text-xl font-bold ${debt.remainingAmount > 0 ? "text-destructive" : "text-success"}`}
            >
              {fmtMoney(debt.remainingAmount)} so&#39;m
            </span>
          </div>
        </div>

        {/* Muddat */}
        <div className="mb-2 mt-5 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-surfaceMuted-foreground">To&#39;lash muddati</span>
          {!editingDue && (
            <button
              onClick={() => {
                setDueDraft(debt.dueDate ?? "");
                setEditingDue(true);
              }}
              className="rounded-control bg-primary/12 px-3 py-1.5 text-xs font-semibold text-primary"
            >
              {debt.dueDate ? "O'zgartirish" : "+ Belgilash"}
            </button>
          )}
        </div>
        {editingDue ? (
          <div className="flex gap-2">
            <input
              type="date"
              value={dueDraft}
              onChange={(e) => setDueDraft(e.target.value)}
              className="flex-1 rounded-control border border-edge bg-cardElevated px-3 py-2.5 text-sm text-foreground"
            />
            <Btn
              variant="primary"
              onClick={() => {
                store.updateDebtNote(debt.id, { dueDate: dueDraft || null });
                setEditingDue(false);
              }}
            >
              ✓
            </Btn>
            <Btn onClick={() => setEditingDue(false)}>✕</Btn>
          </div>
        ) : (
          <div className="rounded-card border border-edge bg-card px-4 py-3 text-sm text-foreground">
            {debt.dueDate ?? <span className="text-surfaceMuted-foreground">Belgilanmagan</span>}
          </div>
        )}

        {/* Izoh */}
        <div className="mb-2 mt-4 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-surfaceMuted-foreground">Izoh</span>
          {!editingNote && (
            <button
              onClick={() => {
                setNoteDraft(debt.note ?? "");
                setEditingNote(true);
              }}
              className="rounded-control bg-primary/12 px-3 py-1.5 text-xs font-semibold text-primary"
            >
              {debt.note ? "Tahrirlash" : "+ Qo'shish"}
            </button>
          )}
        </div>
        {editingNote ? (
          <div>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={2}
              placeholder="Masalan: Juma kuni beradi"
              className="w-full rounded-card border border-edge bg-card px-4 py-3 text-sm text-foreground outline-none placeholder:text-surfaceMuted-foreground/60 focus:border-primary/50"
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Btn
                variant="primary"
                onClick={() => {
                  store.updateDebtNote(debt.id, { note: noteDraft });
                  setEditingNote(false);
                }}
              >
                ✓ Saqlash
              </Btn>
              <Btn onClick={() => setEditingNote(false)}>Bekor</Btn>
            </div>
          </div>
        ) : (
          <div className="rounded-card border border-edge bg-card px-4 py-3 text-sm text-foreground/90">
            {debt.note ? `"${debt.note}"` : <span className="text-surfaceMuted-foreground">Izoh yo&#39;q</span>}
          </div>
        )}

        {/* To'lov tarixi */}
        <SectionTitle>To&#39;lovlar tarixi</SectionTitle>
        {debt.payments.length === 0 ? (
          <div className="rounded-card border border-dashed border-edge py-4 text-center text-xs text-surfaceMuted-foreground">
            Hali to&#39;lov yo&#39;q
          </div>
        ) : (
          <div className="space-y-1.5">
            {debt.payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-card border border-edge bg-card px-3.5 py-2.5 text-sm"
              >
                <div>
                  <div className="font-semibold text-success">+{fmtMoney(p.amount)} so&#39;m</div>
                  <div className="text-[11px] text-surfaceMuted-foreground">
                    {fmtDate(p.at)} {fmtHM(p.at)} · {p.staffName}
                  </div>
                </div>
                <div className="text-xs text-surfaceMuted-foreground">
                  {p.method === "cash" ? "💵" : p.method === "card" ? "💳" : "💵+💳"}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* To'lov qo'shish */}
        {debt.remainingAmount > 0 && (
          <>
            <SectionTitle>To&#39;lov qo&#39;shish</SectionTitle>
            <Input value={payAmount} onChange={setPayAmount} placeholder="Summa (so'm)" type="number" />
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Btn variant={payMethod === "cash" ? "primary" : "ghost"} onClick={() => setPayMethod("cash")}>
                💵 Naqd
              </Btn>
              <Btn variant={payMethod === "card" ? "primary" : "ghost"} onClick={() => setPayMethod("card")}>
                💳 Karta
              </Btn>
              <Btn variant={payMethod === "mixed" ? "primary" : "ghost"} onClick={() => setPayMethod("mixed")}>
                💵+💳
              </Btn>
            </div>
            <div className="mt-2">
              <Input value={payNote} onChange={setPayNote} placeholder="Izoh (ixtiyoriy)" />
            </div>
            <div className="mt-3">
              <Btn
                variant="gold"
                className="w-full"
                disabled={!Number(payAmount) || Number(payAmount) <= 0}
                onClick={() => {
                  store.payDebt(debt.id, Number(payAmount), payMethod, payNote || undefined);
                  setPayAmount("");
                  setPayNote("");
                }}
              >
                ✓ To&#39;lovni qayd etish
              </Btn>
            </div>
          </>
        )}

        {/* Faqat Super Admin: asl summani tuzatish */}
        {isSuper && (
          <>
            <SectionTitle>Super Admin — summani tuzatish</SectionTitle>
            {!showCorrect ? (
              <button
                onClick={() => {
                  setCorrectAmount(String(debt.originalAmount));
                  setShowCorrect(true);
                }}
                className="w-full rounded-control border border-destructive/25 py-2.5 text-xs font-medium text-destructive/90"
              >
                Xato yozilgan — asl summani tuzatish
              </button>
            ) : (
              <div className="rounded-card border border-destructive/25 bg-destructive/8 p-4">
                <div className="mb-2 text-[11px] leading-relaxed text-destructive">
                  Bu — moliyaviy KORREKSIYA (masalan xato summa yozilgan bo&#39;lsa). Oddiy to&#39;lov uchun
                  yuqoridagi &#34;To&#39;lov qo&#39;shish&#34;ni ishlating.
                </div>
                <Input value={correctAmount} onChange={setCorrectAmount} placeholder="To'g'ri asl summa" type="number" />
                <div className="mt-2">
                  <textarea
                    value={correctReason}
                    onChange={(e) => setCorrectReason(e.target.value)}
                    rows={2}
                    placeholder="Tuzatish sababi (majburiy)"
                    className="w-full rounded-card border border-edge bg-card px-4 py-3 text-sm text-foreground outline-none placeholder:text-surfaceMuted-foreground/60"
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Btn
                    variant="danger"
                    disabled={!correctReason.trim() || !correctAmount}
                    onClick={() => {
                      store.correctDebt(debt.id, Number(correctAmount), correctReason.trim());
                      setShowCorrect(false);
                      setCorrectReason("");
                    }}
                  >
                    ✓ Tuzatish
                  </Btn>
                  <Btn onClick={() => setShowCorrect(false)}>Bekor</Btn>
                </div>
              </div>
            )}
          </>
        )}

        <div className="mt-5 rounded-card bg-card px-4 py-3 text-xs leading-relaxed text-surfaceMuted-foreground">
          Yaratdi: <span className="text-foreground">{debt.createdByName}</span> ·{" "}
          {fmtDate(debt.createdAt)} {fmtHM(debt.createdAt)}
          {debt.closedAt && (
            <>
              <br />
              To&#39;liq to&#39;landi: <span className="text-foreground">{fmtDate(debt.closedAt)} {fmtHM(debt.closedAt)}</span>
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}
