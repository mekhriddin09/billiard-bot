"use client";

// QR sahifa — faqat OMMAVIY ma'lumot. Mijoz shaxsi, zakazlar,
// telefon, bonuslar hech qachon ko'rsatilmaydi.

import PriceTag from "@/components/user/ui/PriceTag";
import { usePublicNow, usePublicStore } from "@/lib/public-store";
import { sessionMinutes, tableCost } from "@/lib/calc";
import { fmtTimer } from "@/lib/format";

export default function PublicTablePage({
  params,
}: {
  params: { id: string };
}) {
  const store = usePublicStore();
  const now = usePublicNow(1000);

  if (!store.ready) {
    return (
      <Center>
        <div className="text-4xl">🎱</div>
      </Center>
    );
  }

  const table = store.tables.find(
    (t) =>
      !t.archived &&
      (t.id === params.id ||
        String(t.number) === params.id ||
        t.name.replace("№", "") === params.id)
  );

  if (!table) {
    return (
      <Center>
        <div className="text-4xl">🎱</div>
        <div className="mt-3 text-sm text-surfaceMuted-foreground">Stol topilmadi</div>
      </Center>
    );
  }

  const session = store.sessions.find(
    (s) => s.tableId === table.id && s.status === "active"
  );
  const minutes = session ? sessionMinutes(session, now) : 0;
  const cost = session ? tableCost(minutes, table.pricePerHour) : 0;

  return (
    <Center>
      <div className="text-[10px] font-bold tracking-[0.3em] text-surfaceMuted-foreground">
        {(store.settings?.clubName ?? "SHO'RCHI BILLIARD CLUB").toUpperCase()}
      </div>
      <div className="mt-2 text-3xl font-extrabold text-foreground">
        {table.type === "tennis" ? "🏓" : "🎱"} Stol {table.name}
      </div>

      {session ? (
        <>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-surfaceMuted px-2.5 py-1 text-[11px] font-bold text-surfaceMuted-foreground">
            ● O&#39;yin davom etmoqda
          </div>
          <div className="mt-6 w-full rounded-sheet border border-edge bg-card p-6">
            <div className="text-[11px] font-extrabold uppercase tracking-widest text-surfaceMuted-foreground">
              O&#39;yin vaqti
            </div>
            <div className="tabular mt-1 text-5xl font-extrabold text-foreground">
              {fmtTimer(now - session.startedAt + session.adjustMinutes * 60000)}
            </div>
            <div className="mt-5 border-t border-edge pt-4">
              <div className="text-[11px] font-extrabold uppercase tracking-widest text-surfaceMuted-foreground">
                Joriy stol summasi
              </div>
              <div className="mt-1">
                <PriceTag amount={cost} size="lg" tone="primary" />
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-success/15 px-2.5 py-1 text-[11px] font-bold text-success">
            ● Bo&#39;sh
          </div>
          <div className="mt-6 w-full rounded-sheet border border-edge bg-card p-6">
            <div className="text-sm text-surfaceMuted-foreground">Bu stol hozir bo&#39;sh</div>
          </div>
        </>
      )}

      <div className="mt-4 text-xs text-surfaceMuted-foreground">
        Narx: <PriceTag amount={table.pricePerHour} size="sm" /> <span>/ soat</span>
      </div>
    </Center>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center bg-background px-6 text-center">
      {children}
    </div>
  );
}
