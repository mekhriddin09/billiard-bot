"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { Btn, Input, Row, SectionTitle, StatusDot } from "@/components/ui/bits";
import { useAdminNow, useAdminStore } from "@/lib/admin-store";
import { computeBill, ordersTotal, sessionMinutes, tableCost } from "@/lib/calc";
import { fmtDate, fmtDurationMin, fmtHM, fmtMoney, fmtPhone, fmtTimer } from "@/lib/format";
import type { PaymentMethod, PaymentStatus } from "@/lib/types";

type View = "main" | "order" | "bill";

export default function TableDetailSheet({
  tableId,
  onClose,
}: {
  tableId: string | null;
  onClose: () => void;
}) {
  const store = useAdminStore();
  const now = useAdminNow(1000);
  const [view, setView] = useState<View>("main");
  const [phone, setPhone] = useState("");
  const [useReward, setUseReward] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paid, setPaid] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("paid");
  const [partialAmount, setPartialAmount] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [debtDueDate, setDebtDueDate] = useState("");
  const [timeOpen, setTimeOpen] = useState(false);
  const [adjustInput, setAdjustInput] = useState("");

  useEffect(() => {
    setView("main");
    setPhone("");
    setUseReward(false);
    setMethod("cash");
    setPaid(false);
    setPaymentStatus("paid");
    setPartialAmount("");
    setCloseNote("");
    setCashAmount("");
    setCardAmount("");
    setDebtDueDate("");
    setTimeOpen(false);
    setAdjustInput("");
  }, [tableId]);

  const table = store.tables.find((t) => t.id === tableId);
  const session = store.sessions.find(
    (s) => s.tableId === tableId && s.status === "active"
  );
  const reservation = store.reservations.find(
    (r) => r.tableId === tableId && r.status === "held" && r.holdUntil > now
  );
  const status = !table
    ? "free"
    : !table.enabled
      ? "off"
      : session
        ? "active"
        : reservation
          ? "reserved"
          : "free";

  const customer = store.customers.find((c) => c.id === session?.customerId);
  const arrivedResv = store.reservations.find(
    (r) => r.tableId === tableId && r.status === "arrived"
  );

  const bill = useMemo(() => {
    if (!session || !table) return null;
    return computeBill(session, table, store.settings, now, {
      useReward,
      customerPoints: customer?.points,
      depositCredit: arrivedResv?.deposit ?? 0,
    });
  }, [session, table, store.settings, now, useReward, customer, arrivedResv]);

  const matchedCustomer = useMemo(() => {
    const clean = phone.replace(/\s/g, "");
    if (clean.length < 7) return undefined;
    return store.customers.find((c) => {
      if (!c.phone) return false;
      return (
        c.phone.replace(/\s/g, "").endsWith(clean.replace("+", "")) ||
        clean.endsWith(c.phone.replace(/\s|\+/g, "").slice(-9))
      );
    });
  }, [phone, store.customers]);

  if (!table) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const rewardEligible =
    !!session &&
    store.settings.loyalty.enabled &&
    !!customer &&
    customer.points >= store.settings.loyalty.pointsForReward &&
    sessionMinutes(session, now) >= store.settings.loyalty.minSessionMinutesForReward;

  return (
    <Sheet open={!!tableId} onClose={onClose}>
      <div className="p-5 pb-8">
        <div className="mb-4 flex items-start justify-between">
          {status === "active" && view === "order" ? (
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setView("main")}
                className="rounded-full bg-cardElevated p-2 text-foreground/70 hover:text-foreground"
                aria-label="Orqaga"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div className="text-lg font-bold text-foreground">Mahsulot qo&#39;shish</div>
            </div>
          ) : (
            <div>
              <div className="text-2xl font-bold text-foreground">
                {table.type === "tennis" ? "🏓" : "🎱"} Stol {table.name}
              </div>
              <div className="mt-1">
                <StatusDot status={status} pulse />
              </div>
            </div>
          )}
          <button
            onClick={onClose}
            className="rounded-full bg-cardElevated p-2 text-foreground/70 hover:text-foreground"
            aria-label="Yopish"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={view + status}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16 }}
          >
            {status === "free" && (
              <div>
                <div className="rounded-card border border-edge bg-card p-4">
                  <Row label="Stol narxi" value={`${fmtMoney(table.pricePerHour)} so'm / soat`} accent />
                  {table.tier === "vip" && <Row label="Turi" value="VIP" />}
                </div>

                <SectionTitle>Mijoz telefoni (ixtiyoriy — bonus uchun)</SectionTitle>
                <Input value={phone} onChange={setPhone} placeholder="+998 90 123 45 67" type="tel" />
                {matchedCustomer && (
                  <div className="mt-2 rounded-card border border-success/30 bg-success/10 px-4 py-3 text-sm">
                    <span className="font-semibold text-success">✓ {matchedCustomer.name}</span>
                    <span className="ml-2 text-surfaceMuted-foreground">⭐ {matchedCustomer.points} ball</span>
                  </div>
                )}
                {phone.replace(/\D/g, "").length >= 9 && !matchedCustomer && (
                  <div className="mt-2 rounded-card border border-primary/25 bg-primary/8 px-4 py-3 text-xs text-primary">
                    Bu raqam tizimda yo&#39;q. Mijoz Telegram botga kirib raqamini
                    yuborsin — shundan keyin bonuslar hisoblanadi.
                  </div>
                )}

                <div className="mt-5 grid grid-cols-1 gap-2">
                  <Btn
                    variant="primary"
                    onClick={() => {
                      store.startSession(table.id, matchedCustomer?.phone ?? (phone || undefined));
                    }}
                  >
                    ▶️ O&#39;yinni boshlash
                  </Btn>
                  <Btn onClick={onClose}>Bekor qilish</Btn>
                </div>
              </div>
            )}

            {status === "reserved" && reservation && (
              <div>
                <div className="rounded-card border border-edge bg-card p-4">
                  <Row label="Depozit" value={`${fmtMoney(reservation.deposit)} so'm`} accent />
                  <Row label="Bron vaqti" value={fmtHM(reservation.createdAt)} />
                  <Row label="Saqlanadi" value={`${fmtHM(reservation.holdUntil)} gacha`} />
                  {reservation.customerPhone && (
                    <Row label="Telefon" value={fmtPhone(reservation.customerPhone)} />
                  )}
                </div>
                <div className="mt-3 rounded-card bg-card px-4 py-3 text-xs leading-relaxed text-surfaceMuted-foreground">
                  Mijoz kelganda o&#39;yin vaqti <b className="text-foreground">bron vaqtidan</b> hisoblanadi.
                  Depozit hisobdan ayiriladi.
                </div>
                <div className="mt-5 grid grid-cols-1 gap-2">
                  <Btn variant="primary" onClick={() => store.arriveReservation(reservation.id)}>
                    ✓ Mijoz keldi — o&#39;yinni boshlash
                  </Btn>
                  <Btn variant="danger" onClick={() => store.cancelReservation(reservation.id)}>
                    Bronni bekor qilish
                  </Btn>
                </div>
              </div>
            )}

            {status === "active" && session && bill && view === "main" && (
              <div>
                <div className="rounded-card border border-edge bg-card p-4 text-center">
                  <div className="tabular text-4xl font-bold text-destructive">
                    {fmtTimer(now - session.startedAt + session.adjustMinutes * 60000)}
                  </div>
                  <div className="mt-1 text-xs text-surfaceMuted-foreground">
                    Boshlangan: {fmtDate(session.startedAt)} {fmtHM(session.startedAt)}
                    {session.adjustMinutes !== 0 && (
                      <span className="ml-1 text-primary">
                        (korreksiya {session.adjustMinutes > 0 ? "+" : ""}
                        {session.adjustMinutes}d)
                      </span>
                    )}
                  </div>
                </div>

                {/* STOL NARXI / JAMI SUMMA */}
                <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                  <div className="rounded-card border border-edge bg-card px-3.5 py-3">
                    <div className="text-[10px] uppercase tracking-wider text-surfaceMuted-foreground">Stol narxi</div>
                    <div className="mt-0.5 text-sm font-bold text-foreground">
                      {fmtMoney(table.pricePerHour)} so&#39;m/soat
                    </div>
                  </div>
                  <div className="rounded-card border border-primary/25 bg-primary/8 px-3.5 py-3">
                    <div className="text-[10px] uppercase tracking-wider text-primary/80">
                      Jami summa
                    </div>
                    <div className="mt-0.5 text-xl font-extrabold text-primary">
                      {fmtMoney(bill.total)} so&#39;m
                    </div>
                  </div>
                </div>

                {customer && (
                  <div className="mt-2.5 flex items-center justify-between rounded-card bg-card px-4 py-2.5 text-sm">
                    <span className="text-foreground">👤 {customer.name}</span>
                    <span className="text-primary">⭐ {customer.points} ball</span>
                  </div>
                )}
                {arrivedResv && (
                  <div className="mt-2 rounded-card border border-primary/25 bg-primary/8 px-4 py-2.5 text-xs text-primary">
                    Bron depoziti hisobdan ayiriladi: −{fmtMoney(arrivedResv.deposit)} so&#39;m
                  </div>
                )}

                {/* + MAHSULOT — katta, ko'rinadigan */}
                <button
                  onClick={() => setView("order")}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-card bg-primary px-4 py-3.5 text-sm font-bold tracking-wide text-primary-foreground shadow-cta transition-colors hover:bg-primary-hover"
                >
                  <span className="text-lg leading-none">+</span> MAHSULOT
                </button>

                {/* BUYURTMALAR */}
                <div className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-surfaceMuted-foreground">
                  Buyurtmalar
                </div>

                {session.orders.length === 0 ? (
                  <div className="rounded-card border border-dashed border-edge py-6 text-center text-xs text-surfaceMuted-foreground">
                    Hozircha buyurtma yo&#39;q
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-card border border-edge">
                    {session.orders.map((o, i) => (
                      <div
                        key={o.id}
                        className={`flex items-center justify-between px-3.5 py-2.5 ${i % 2 ? "bg-card/60" : "bg-card"}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-base leading-none">{o.emoji}</span>
                          <div>
                            <div className="text-sm text-foreground">{o.name}</div>
                            <div className="text-[11px] text-surfaceMuted-foreground">
                              {o.qty} × {fmtMoney(o.price)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{fmtMoney(o.price * o.qty)} so&#39;m</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() =>
                                o.productId
                                  ? store.addOrder(session.id, o.productId, -1)
                                  : store.adjustCustomOrder(session.id, o.id, -1)
                              }
                              className="h-6 w-6 rounded-md bg-cardElevated text-xs text-foreground/70"
                            >
                              −
                            </button>
                            <button
                              onClick={() =>
                                o.productId
                                  ? store.addOrder(session.id, o.productId, 1)
                                  : store.adjustCustomOrder(session.id, o.id, 1)
                              }
                              className="h-6 w-6 rounded-md bg-primary text-xs text-foreground"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* JAMI — stol + mahsulot yig'indisi */}
                <div className="mt-3 rounded-card border border-edge bg-card p-3.5">
                  <Row label="STOL (vaqt)" value={`${fmtMoney(bill.tableCost)} so'm`} />
                  <Row label="MAHSULOTLAR" value={`${fmtMoney(bill.ordersTotal)} so'm`} />
                  <div className="mt-1.5 flex items-center justify-between border-t border-edge pt-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">Jami</span>
                    <span className="text-lg font-extrabold text-primary">{fmtMoney(bill.total)} so&#39;m</span>
                  </div>
                </div>

                {/* VAQTNI TUZATISH — collapsible, kamdan-kam kerak */}
                <button
                  onClick={() => setTimeOpen((v) => !v)}
                  className="mt-5 flex w-full items-center justify-between rounded-card border border-edge bg-card px-3.5 py-3 text-left"
                >
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-surfaceMuted-foreground">
                    ⏱ Vaqtni tuzatish
                  </span>
                  <motion.span
                    animate={{ rotate: timeOpen ? 180 : 0 }}
                    transition={{ duration: 0.15 }}
                    className="text-surfaceMuted-foreground"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {timeOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 rounded-card border border-edge bg-card p-3.5">
                        <div className="mb-2.5 flex items-center justify-between text-xs">
                          <span className="text-surfaceMuted-foreground">Boshlanish vaqti</span>
                          <span className="font-semibold text-foreground">
                            {fmtDate(session.startedAt)} {fmtHM(session.startedAt)}
                          </span>
                        </div>
                        <div className="mb-1 text-xs text-surfaceMuted-foreground">
                          Necha daqiqa? (qo&#39;shish uchun musbat, ayirish uchun manfiy son — masalan −20)
                        </div>
                        <div className="flex gap-2">
                          <Input
                            value={adjustInput}
                            onChange={setAdjustInput}
                            placeholder="masalan: 15 yoki -10"
                            type="number"
                            className="flex-1"
                          />
                          <Btn
                            variant="primary"
                            disabled={!Number(adjustInput)}
                            onClick={() => {
                              const m = Math.round(Number(adjustInput));
                              if (!m) return;
                              store.adjustTime(session.id, m);
                              setAdjustInput("");
                            }}
                          >
                            Qo&#39;llash
                          </Btn>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mt-5">
                  <Btn variant="danger" className="w-full" onClick={() => setView("bill")}>
                    🔴 YOPISH VA TO&#39;LOV
                  </Btn>
                </div>
              </div>
            )}

            {status === "active" && session && view === "order" && (
              <OrderPicker
                sessionId={session.id}
                onBack={() => setView("main")}
              />
            )}

            {status === "active" && session && bill && view === "bill" && (
              <div>
                <div className="rounded-card border border-edge bg-card p-4">
                  <Row
                    label={`${table.type === "tennis" ? "🏓 Tennis" : "🎱 Billiard"} — ${fmtDurationMin(bill.minutes)}`}
                    value={`${fmtMoney(tableCost(bill.minutes, table.pricePerHour))} so'm`}
                  />
                  {session.orders.map((o) => (
                    <Row
                      key={o.id}
                      label={`${o.emoji} ${o.name} ×${o.qty}`}
                      value={`${fmtMoney(o.price * o.qty)} so'm`}
                    />
                  ))}
                  {bill.rewardMinutesUsed > 0 && (
                    <Row
                      label={`🎁 Bonus soat (−${store.settings.loyalty.pointsForReward} ball)`}
                      value={`−${fmtMoney(tableCost(bill.minutes, table.pricePerHour) - bill.tableCost)} so'm`}
                      accent
                    />
                  )}
                  {bill.depositCredit > 0 && (
                    <Row label="Bron depoziti" value={`−${fmtMoney(bill.depositCredit)} so'm`} accent />
                  )}
                  <div className="mt-2 flex items-center justify-between border-t border-edge pt-3">
                    <span className="text-sm font-bold uppercase tracking-wider">Jami</span>
                    <span className="text-2xl font-bold text-primary">
                      {fmtMoney(bill.total)} so&#39;m
                    </span>
                  </div>
                </div>

                {rewardEligible && (
                  <button
                    onClick={() => setUseReward(!useReward)}
                    className={`mt-3 flex w-full items-center justify-between rounded-card border px-4 py-3 text-sm transition-colors ${
                      useReward
                        ? "border-success/40 bg-success/10 text-success"
                        : "border-edge bg-card text-foreground"
                    }`}
                  >
                    <span>🎁 1 soat bepul ishlatish ({customer?.points} ball bor)</span>
                    <span>{useReward ? "✓" : ""}</span>
                  </button>
                )}
                {customer && bill.pointsToEarn > 0 && (
                  <div className="mt-2 rounded-card bg-card px-4 py-2.5 text-xs text-surfaceMuted-foreground">
                    Yopilganda avtomatik: <span className="text-success">+{bill.pointsToEarn} ball</span>{" "}
                    ({customer.name})
                  </div>
                )}

                <SectionTitle>To&#39;lov usuli</SectionTitle>
                <div className="grid grid-cols-3 gap-2">
                  <Btn
                    variant={method === "cash" ? "primary" : "ghost"}
                    onClick={() => setMethod("cash")}
                  >
                    💵 Naqd
                  </Btn>
                  <Btn
                    variant={method === "card" ? "primary" : "ghost"}
                    onClick={() => setMethod("card")}
                    disabled={!store.settings.cardPaymentEnabled}
                  >
                    💳 Karta
                  </Btn>
                  <Btn
                    variant={method === "mixed" ? "primary" : "ghost"}
                    onClick={() => setMethod("mixed")}
                    disabled={!store.settings.cardPaymentEnabled}
                  >
                    💵+💳 Aralash
                  </Btn>
                </div>

                {method === "mixed" && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Input value={cashAmount} onChange={setCashAmount} placeholder="Naqd summa" type="number" />
                    <Input value={cardAmount} onChange={setCardAmount} placeholder="Karta summa" type="number" />
                  </div>
                )}

                <SectionTitle>To&#39;lov holati</SectionTitle>
                <div className="grid grid-cols-3 gap-2">
                  <Btn
                    variant={paymentStatus === "paid" ? "primary" : "ghost"}
                    onClick={() => setPaymentStatus("paid")}
                  >
                    To&#39;landi
                  </Btn>
                  <Btn
                    variant={paymentStatus === "partial" ? "gold" : "ghost"}
                    onClick={() => setPaymentStatus("partial")}
                  >
                    Qisman
                  </Btn>
                  <Btn
                    variant={paymentStatus === "debt" ? "danger" : "ghost"}
                    onClick={() => setPaymentStatus("debt")}
                  >
                    Qarz
                  </Btn>
                </div>

                {paymentStatus === "partial" && (
                  <div className="mt-2">
                    <Input
                      value={partialAmount}
                      onChange={setPartialAmount}
                      placeholder="To'langan summa (so'm)"
                      type="number"
                    />
                  </div>
                )}
                {paymentStatus !== "paid" && (
                  <div className="mt-2 rounded-card border border-destructive/25 bg-destructive/8 px-4 py-2.5 text-xs text-destructive">
                    Qarz qoladi:{" "}
                    <b>
                      {fmtMoney(
                        paymentStatus === "debt"
                          ? bill.total
                          : Math.max(0, bill.total - (Number(partialAmount) || 0))
                      )}{" "}
                      so&#39;m
                    </b>
                  </div>
                )}
                {paymentStatus !== "paid" && (
                  <div className="mt-2">
                    <div className="mb-1 text-xs text-surfaceMuted-foreground">To&#39;lash muddati (ixtiyoriy)</div>
                    <input
                      type="date"
                      value={debtDueDate}
                      onChange={(e) => setDebtDueDate(e.target.value)}
                      className="w-full rounded-control border border-edge bg-cardElevated px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50"
                    />
                  </div>
                )}

                <SectionTitle>Izoh (ixtiyoriy)</SectionTitle>
                <textarea
                  value={closeNote}
                  onChange={(e) => setCloseNote(e.target.value)}
                  rows={2}
                  placeholder="Masalan: Qarzga yopildi, ertaga to'laydi"
                  className="w-full rounded-card border border-edge bg-card px-4 py-3 text-sm text-foreground outline-none placeholder:text-surfaceMuted-foreground/60 focus:border-primary/50"
                />

                <div className="mt-4 grid grid-cols-1 gap-2">
                  <Btn
                    variant="danger"
                    disabled={paid}
                    onClick={() => {
                      if (paid) return;
                      setPaid(true);
                      const total = bill.total;
                      const paidAmt =
                        paymentStatus === "paid"
                          ? total
                          : paymentStatus === "debt"
                            ? 0
                            : Math.max(0, Math.min(total, Number(partialAmount) || 0));
                      store.closeSession(session.id, method, useReward, {
                        paymentStatus,
                        paidAmount: paidAmt,
                        note: closeNote,
                        cashAmount: method === "mixed" ? Number(cashAmount) || 0 : undefined,
                        cardAmount: method === "mixed" ? Number(cardAmount) || 0 : undefined,
                        debtDueDate: paymentStatus !== "paid" && debtDueDate ? debtDueDate : undefined,
                      });
                      onClose();
                    }}
                  >
                    {paymentStatus === "paid"
                      ? "✓ To'landi va yopish"
                      : paymentStatus === "partial"
                        ? "✓ Qisman to'lov va yopish"
                        : "✓ Qarzga yozish va yopish"}
                  </Btn>
                  <Btn onClick={() => setView("main")}>← Orqaga</Btn>
                </div>
              </div>
            )}

            {status === "off" && (
              <div className="rounded-card bg-card px-4 py-6 text-center text-sm text-surfaceMuted-foreground">
                Bu stol vaqtincha o&#39;chirilgan. Sozlamalardan yoqish mumkin.
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Sheet>
  );
}

// ─── Tez zakaz qo'shish ────────────────────────────────────────────────
function OrderPicker({
  sessionId,
  onBack,
}: {
  sessionId: string;
  onBack: () => void;
}) {
  const store = useAdminStore();
  // Yashirilgan (enabled=false) kategoriyalar Mini POS tezkor tanlovida
  // ko'rsatilmaydi (2026-09, "kategoriya yashirish") — o'zi/mahsulotlari
  // hech qayerda o'chirilmaydi, Sozlamalar → Mahsulotlar'da qayta yoqilishi
  // mumkin.
  const visibleCategories = store.categories.filter((c) => c.enabled !== false);
  const [catId, setCatId] = useState(visibleCategories[0]?.id ?? "");
  const session = store.sessions.find((s) => s.id === sessionId);

  // "Tezkor/maxsus mahsulot" (2026-08) — Products katalogida yo'q narsani
  // (masalan hali kiritilmagan Red Bull) darhol shu sessiyaga qo'shish
  // uchun kichik forma. Bu HECH QANDAY katalog/kategoriya/ombor yozuvi
  // yaratmaydi — faqat bitta session_orders qatori (backend: qarang
  // addCustomOrderCore, src/lib/services/sessions.ts).
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customQty, setCustomQty] = useState(1);
  const [customError, setCustomError] = useState<string | null>(null);
  const [submittingCustom, setSubmittingCustom] = useState(false);

  const products = store.products.filter(
    (p) => p.categoryId === catId && p.active
  );

  const qtyOf = (pid: string) =>
    session?.orders.find((o) => o.productId === pid)?.qty ?? 0;

  const totalQty = session ? session.orders.reduce((sum, o) => sum + o.qty, 0) : 0;

  const customPriceNum = Math.round(Number(customPrice)) || 0;
  const customTotal = customPriceNum * customQty;

  const submitCustom = async () => {
    if (submittingCustom) return;
    const trimmed = customName.trim();
    if (!trimmed) {
      setCustomError("Mahsulot nomini kiriting");
      return;
    }
    if (!customPriceNum || customPriceNum <= 0) {
      setCustomError("Narx 0 dan katta bo'lishi kerak");
      return;
    }
    if (!customQty || customQty < 1) {
      setCustomError("Miqdor kamida 1 bo'lishi kerak");
      return;
    }
    setSubmittingCustom(true);
    setCustomError(null);
    try {
      await store.addCustomOrder(sessionId, trimmed, customPriceNum, customQty);
      setCustomName("");
      setCustomPrice("");
      setCustomQty(1);
      setCustomOpen(false);
      onBack(); // darhol Mini POS'ga qaytish (2026-08 talabi)
    } catch (e: any) {
      setCustomError(e?.message ?? "Xatolik yuz berdi");
    } finally {
      setSubmittingCustom(false);
    }
  };

  if (customOpen) {
    return (
      <div>
        <button
          onClick={() => setCustomOpen(false)}
          className="mb-3 flex items-center gap-1.5 text-sm font-medium text-surfaceMuted-foreground hover:text-foreground"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Orqaga
        </button>
        <div className="rounded-card border border-edge bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
            <span className="text-lg leading-none">⚡</span> Tezkor mahsulot
          </div>

          <div className="text-[11px] font-bold uppercase tracking-wide text-surfaceMuted-foreground">
            Mahsulot nomi
          </div>
          <Input
            value={customName}
            onChange={setCustomName}
            placeholder="Masalan: Red Bull 0.25L"
            className="mt-1.5"
          />

          <div className="mt-3 text-[11px] font-bold uppercase tracking-wide text-surfaceMuted-foreground">
            Narxi (so&#39;m)
          </div>
          <Input
            value={customPrice}
            onChange={setCustomPrice}
            placeholder="25000"
            type="number"
            className="mt-1.5"
          />

          <div className="mt-3 text-[11px] font-bold uppercase tracking-wide text-surfaceMuted-foreground">
            Miqdori
          </div>
          <div className="mt-1.5 flex items-center justify-center gap-4">
            <button
              onClick={() => setCustomQty((q) => Math.max(1, q - 1))}
              className="flex h-9 w-9 items-center justify-center rounded-control bg-cardElevated text-base font-bold text-foreground/80"
            >
              −
            </button>
            <span className="min-w-[28px] text-center text-lg font-bold tabular text-foreground">
              {customQty}
            </span>
            <button
              onClick={() => setCustomQty((q) => q + 1)}
              className="flex h-9 w-9 items-center justify-center rounded-control bg-primary text-base font-bold text-primary-foreground"
            >
              +
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-edge pt-3">
            <span className="text-xs font-bold uppercase tracking-wider text-surfaceMuted-foreground">Jami</span>
            <span className="text-lg font-extrabold text-primary">{fmtMoney(customTotal)} so&#39;m</span>
          </div>

          {customError && <div className="mt-2 text-xs font-medium text-destructive">{customError}</div>}

          <Btn variant="primary" className="mt-4 w-full" disabled={submittingCustom} onClick={submitCustom}>
            {submittingCustom ? "Qo'shilmoqda..." : "QO'SHISH"}
          </Btn>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setCustomOpen(true)}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-card border border-dashed border-primary/40 bg-primary/8 px-4 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-primary/12"
      >
        <span className="text-base leading-none">⚡</span> Tezkor mahsulot
      </button>

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {visibleCategories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCatId(c.id)}
            className={`whitespace-nowrap rounded-card px-4 py-2 text-sm font-medium transition-colors ${
              catId === c.id
                ? "bg-primary text-foreground"
                : "bg-card text-surfaceMuted-foreground"
            }`}
          >
            {c.emoji} {c.name}
          </button>
        ))}
      </div>

      <div className="mt-3 overflow-hidden rounded-card border border-edge">
        {products.length === 0 ? (
          <div className="py-8 text-center text-xs text-surfaceMuted-foreground">
            Bu kategoriyada mahsulot yo&#39;q
          </div>
        ) : (
          products.map((p, i) => {
            const qty = qtyOf(p.id);
            return (
              <div
                key={p.id}
                className={`flex items-center justify-between gap-3 px-3.5 py-3 ${i % 2 ? "bg-card/60" : "bg-card"} ${
                  !p.available ? "opacity-40" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="text-xl leading-none">{p.emoji}</span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{p.name}</div>
                    <div className="text-xs text-surfaceMuted-foreground">
                      {p.available ? `${fmtMoney(p.price)} so'm` : "tugagan"}
                    </div>
                    {qty > 0 && (
                      <div className="mt-0.5 text-xs font-semibold text-primary">
                        {fmtMoney(p.price * qty)} so&#39;m
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <motion.button
                    whileTap={{ scale: qty > 0 ? 0.9 : 1 }}
                    onClick={() => qty > 0 && store.addOrder(sessionId, p.id, -1)}
                    disabled={qty === 0}
                    className={`flex h-9 w-9 items-center justify-center rounded-control text-base font-bold ${
                      qty > 0
                        ? "bg-cardElevated text-foreground/80"
                        : "bg-cardElevated/50 text-foreground/25"
                    }`}
                  >
                    −
                  </motion.button>
                  <span className="min-w-[20px] text-center text-base font-bold tabular text-foreground">
                    {qty}
                  </span>
                  <motion.button
                    whileTap={{ scale: p.available ? 0.9 : 1 }}
                    onClick={() => p.available && store.addOrder(sessionId, p.id, 1)}
                    disabled={!p.available}
                    className={`flex h-9 w-9 items-center justify-center rounded-control text-base font-bold text-primary-foreground ${
                      p.available ? "bg-primary" : "bg-primary/30"
                    }`}
                  >
                    +
                  </motion.button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="sticky bottom-0 mt-4 -mx-5 border-t border-edge bg-background/95 px-5 pb-1 pt-3 backdrop-blur">
        {session && totalQty > 0 && (
          <div className="mb-2.5 flex items-center justify-between text-sm">
            <span className="text-surfaceMuted-foreground">Jami: {totalQty} ta</span>
            <span className="font-bold text-primary">{fmtMoney(ordersTotal(session.orders))} so&#39;m</span>
          </div>
        )}
        <Btn variant="primary" className="w-full" onClick={onBack}>
          ✓ Tayyor
        </Btn>
      </div>
    </div>
  );
}
