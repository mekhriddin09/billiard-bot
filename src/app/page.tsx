"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import UserShell from "@/components/user/UserShell";
import UserTableCard from "@/components/user/UserTableCard";
import Sheet from "@/components/ui/Sheet";
import { Btn } from "@/components/user/ui/controls";
import StatusPill from "@/components/user/ui/StatusPill";
import PriceTag from "@/components/user/ui/PriceTag";
import TableVisual from "@/components/billiard/TableVisual";
import { usePublicNow, usePublicStore } from "@/lib/public-store";
import type { ClubTable, TableStatus } from "@/lib/types";

/**
 * Bot Menu Button hammaga (mijoz + xodim) BIR XIL manzilni ochadi. Xodim
 * bo'lsa, tezkorlik uchun avtomatik /admin'ga o'tkaziladi — mijoz uchun
 * bu tekshiruv sezilarli emas (bir necha yuz millisekund). Mijoz UI'sida
 * admin panelga hech qanday havola ko'rsatilmaydi.
 */
function useAutoAdminRedirect() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.initData) {
      setChecking(false);
      return;
    }
    fetch("/api/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: tg.initData }),
    })
      .then((res) => {
        if (res.ok) {
          router.replace("/admin");
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  return checking;
}

export default function UserClubPage() {
  const checkingStaff = useAutoAdminRedirect();
  const store = usePublicStore();
  const now = usePublicNow(5000);
  const [selected, setSelected] = useState<ClubTable | null>(null);

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

  const visible = store.tables.filter((t) => !t.archived && t.enabled);
  const billiard = visible.filter((t) => t.type === "billiard");
  const tennis = visible.filter((t) => t.type === "tennis");

  // "Bog'lanish so'rovi" (2026-08) — avtomatik hold/deposit YO'Q, shuning
  // uchun "nechta stol bir vaqtda online bron qilingan" degan limit endi
  // ma'nosiz (bir nechta mijoz bemalol so'rov qoldirishi mumkin, admin
  // o'zi hal qiladi) — faqat R.enabled + stolning o'zi onlayn-bron
  // qilinadigan va HOZIR bo'sh ekanligi tekshiriladi.
  const R = store.settings?.reservation ?? { enabled: false, deposit: 0, holdMinutes: 0 };
  const canReserve = (t: ClubTable) => R.enabled && t.onlineReservable && statusOf(t.id) === "free";

  const freeCount = useMemo(
    () => visible.filter((t) => statusOf(t.id) === "free").length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, store.sessions, store.reservations, now]
  );

  const selStatus = selected ? statusOf(selected.id) : "free";
  const waiting = selected ? store.myWatchedTableIds.includes(selected.id) : false;
  const showBooking = !!selected && selStatus === "free" && canReserve(selected);

  const toggleWait = (id: string) => {
    if (store.myWatchedTableIds.includes(id)) store.unwatchTable(id).catch(() => {});
    else store.watchTable(id).catch(() => {});
  };

  // "Bog'lanish so'rovi" formasi holati — sheet har safar YANGI stol uchun
  // ochilganda tozalanadi, telefon esa mijoz profilida allaqachon bo'lsa
  // oldindan to'ldiriladi (qayta yozdirmaslik uchun).
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setPhone(store.me?.phone ?? "");
    setNote("");
    setSubmitError(null);
    setSubmitted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const submitRequest = async () => {
    if (!selected) return;
    if (!phone.trim()) {
      setSubmitError("Telefon raqamini kiriting");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await store.requestReservation(selected.id, phone.trim(), note.trim() || undefined);
      setSubmitted(true);
    } catch (e: any) {
      setSubmitError(e?.message ?? "Xatolik yuz berdi");
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingStaff || !store.ready) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="text-4xl">🎱</div>
      </div>
    );
  }

  return (
    <UserShell>
      {/* Availability strip */}
      <div className="mb-5 flex animate-fade-in items-center gap-3 rounded-card border border-edge bg-card px-4 py-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/12 text-sm font-extrabold text-success">
          {freeCount}
        </span>
        <div>
          <div className="text-sm font-bold text-foreground">
            <span className="text-success">{freeCount} ta</span> stol bo&#39;sh
          </div>
          <div className="mt-0.5 text-[11px] text-surfaceMuted-foreground">
            {billiard.length} billiard &middot; {tennis.length} tennis
          </div>
        </div>
      </div>

      {/* Billiard grid */}
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground/80">
          Billiard stollar
        </span>
        <span className="text-[11px] text-surfaceMuted-foreground">({billiard.length})</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {billiard.map((t) => (
          <UserTableCard
            key={t.id}
            table={t}
            status={statusOf(t.id)}
            onClick={() => setSelected(t)}
          />
        ))}
      </div>

      {/* Tennis */}
      {tennis.length > 0 && (
        <>
          <div className="mb-2.5 mt-6 flex items-center gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground/80">
              Tennis stollar
            </span>
            <span className="text-[11px] text-surfaceMuted-foreground">({tennis.length})</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {tennis.map((t) => (
              <UserTableCard
                key={t.id}
                table={t}
                status={statusOf(t.id)}
                onClick={() => setSelected(t)}
              />
            ))}
          </div>
        </>
      )}

      {/* Bo'sh stol — mijoz telefon raqamini qoldiradi, admin o'zi
          qo'ng'iroq qilib bronni kelishadi (2026-08, avtomatik
          depozit/hold TO'LIQ almashtirildi — "Bog'lanish so'rovi"). */}
      <Sheet open={showBooking} onClose={() => setSelected(null)}>
        {selected && (
          <div className="animate-slide-up p-5 pb-8">
            <div className="mx-auto max-w-[220px]">
              <TableVisual id={selected.id} type={selected.type} status="free" className="w-full" />
            </div>
            <div className="mt-4 text-center">
              <div className="text-xl font-extrabold text-foreground">
                {selected.type === "tennis" ? "🏓" : "🎱"} Stol {selected.name}
              </div>
              <div className="mt-2 flex justify-center">
                <StatusPill status="free" />
              </div>
              <div className="mt-2">
                <PriceTag amount={selected.pricePerHour} size="sm" tone="muted" />
                <span className="ml-1 text-sm text-surfaceMuted-foreground">/ soat</span>
              </div>
            </div>

            {submitted ? (
              <div className="mt-6 rounded-card border border-success/25 bg-success/10 px-4 py-4 text-center">
                <div className="text-2xl">✅</div>
                <div className="mt-2 text-[13.5px] font-bold text-foreground">So&#39;rov qabul qilindi</div>
                <div className="mt-1 text-[12.5px] text-surfaceMuted-foreground">
                  Administrator tez orada sizga qo&#39;ng&#39;iroq qiladi.
                </div>
                <Btn variant="outline" className="mt-4 w-full" onClick={() => setSelected(null)}>
                  Yopish
                </Btn>
              </div>
            ) : (
              <div className="mt-5">
                <p className="text-[12.5px] leading-relaxed text-surfaceMuted-foreground">
                  Bu stolni oldindan band qilish uchun telefon raqamingizni qoldiring —
                  administrator siz bilan bog&#39;lanib, bronni kelishadi.
                </p>
                <label className="mt-4 block text-[11px] font-bold uppercase tracking-wide text-surfaceMuted-foreground">
                  Telefon raqami
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+998 90 123 45 67"
                  className="mt-1.5 w-full rounded-control border border-edge bg-card px-3.5 py-3 text-[14px] text-foreground outline-none focus:border-primary"
                />
                <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-surfaceMuted-foreground">
                  Izoh (ixtiyoriy)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Masalan: soat 19:00 atrofida"
                  className="mt-1.5 w-full resize-none rounded-control border border-edge bg-card px-3.5 py-3 text-[14px] text-foreground outline-none focus:border-primary"
                />
                {submitError && <div className="mt-2 text-[12px] font-medium text-destructive">{submitError}</div>}
                <Btn variant="primary" className="mt-4 w-full" onClick={submitRequest} disabled={submitting}>
                  {submitting ? "Yuborilmoqda..." : "📞 Bog'lanishni so'rash"}
                </Btn>
                <Btn variant="ghost" className="mt-2 w-full" onClick={() => setSelected(null)}>
                  Bekor qilish
                </Btn>
              </div>
            )}
          </div>
        )}
      </Sheet>

      {/* Band/saqlangan/yopiq stol — faqat ma'lumot, tanlov yo'q */}
      <Sheet open={!!selected && !showBooking} onClose={() => setSelected(null)}>
        {selected && (
          <div className="animate-slide-up p-5 pb-8">
            <div className="mx-auto max-w-[220px]">
              <TableVisual id={selected.id} type={selected.type} status={selStatus} className="w-full" />
            </div>
            <div className="mt-4 text-center">
              <div className="text-xl font-extrabold text-foreground">
                {selected.type === "tennis" ? "🏓" : "🎱"} Stol {selected.name}
              </div>
              <div className="mt-2 flex justify-center">
                <StatusPill status={selStatus} />
              </div>
              <div className="mt-2">
                <PriceTag amount={selected.pricePerHour} size="sm" tone="muted" />
                <span className="ml-1 text-sm text-surfaceMuted-foreground">/ soat</span>
              </div>
            </div>

            <div className="mt-6 grid gap-2">
              {selStatus === "active" && (
                <Btn
                  variant={waiting ? "primary" : "outline"}
                  className="w-full"
                  onClick={() => toggleWait(selected.id)}
                >
                  {waiting ? "✓ Bo'shaganda xabar beramiz" : "🔔 Bo'shaganda xabar ber"}
                </Btn>
              )}
              <Btn variant="ghost" className="w-full" onClick={() => setSelected(null)}>
                Yopish
              </Btn>
            </div>
          </div>
        )}
      </Sheet>
    </UserShell>
  );
}
