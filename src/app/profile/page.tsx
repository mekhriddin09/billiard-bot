"use client";

import { useState } from "react";
import UserShell from "@/components/user/UserShell";
import EmptyState from "@/components/user/ui/EmptyState";
import PriceTag from "@/components/user/ui/PriceTag";
import { usePublicStore } from "@/lib/public-store";
import { fmtDate, fmtDurationMin, fmtPhone } from "@/lib/format";

export default function ProfilePage() {
  const store = usePublicStore();
  const me = store.me;
  const [showAll, setShowAll] = useState(false);

  if (!store.ready) {
    return (
      <UserShell>
        <div className="flex h-40 items-center justify-center text-4xl">🎱</div>
      </UserShell>
    );
  }

  if (!me || !store.settings) {
    return (
      <UserShell>
        <EmptyState
          icon="👤"
          title="Kirish talab qilinadi"
          description="Profilni ko'rish uchun Telegram orqali kiring"
        />
      </UserShell>
    );
  }

  const L = store.settings.loyalty;
  const S = store.settings;

  const history = store.myHistory;
  const shown = showAll ? history.slice(0, 20) : history.slice(0, 4);

  const toReward = Math.max(0, L.pointsForReward - me.points);
  const progress = Math.min(100, (me.points / L.pointsForReward) * 100);

  const initials = me.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <UserShell
      header={
        <div className="flex items-center justify-between">
          <span className="text-lg font-extrabold text-foreground">Profil</span>
          <button className="flex h-8 w-8 items-center justify-center rounded-control text-foreground/60">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V20a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H4a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.6V4a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.6 1H20a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.6 1Z"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          </button>
        </div>
      }
    >
      {/* Identity */}
      <div className="flex animate-fade-in items-center gap-3 rounded-card border border-edge bg-card px-4 py-3.5">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-sm font-extrabold text-primary">
          {initials}
        </div>
        <div>
          <div className="text-base font-extrabold text-foreground">{me.name}</div>
          <div className="text-xs text-surfaceMuted-foreground">{fmtPhone(me.phone)}</div>
        </div>
      </div>

      {/* Loyalty */}
      {L.enabled && (
        <div className="mt-3 rounded-card border border-secondary/30 bg-secondary/[0.06] p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-secondary">
              ⭐ Bonus ballar
            </span>
            <span className="text-2xl font-extrabold text-secondary">{me.points}</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surfaceMuted">
            <div className="h-full rounded-full bg-secondary" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 text-[11px] text-surfaceMuted-foreground">
            {toReward > 0 ? (
              <>
                Keyingi mukofotgacha: <b className="text-foreground">{toReward} ball</b>
              </>
            ) : (
              <b className="text-success">🎁 Bepul soat tayyor!</b>
            )}
          </div>
          <div className="mt-2 border-t border-edge pt-2 text-[10px] leading-relaxed text-surfaceMuted-foreground">
            {Math.floor(L.minutesPerPoint / 60)} soat o&#39;yin = 1 ball &middot;{" "}
            {L.pointsForReward} ball = {Math.floor(L.rewardMinutes / 60)} soat bepul
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-card border border-edge bg-card px-4 py-3 text-center">
          <div className="text-lg font-extrabold text-foreground">🎱 {me.totalVisits}</div>
          <div className="text-[10px] text-surfaceMuted-foreground">Tashrif</div>
        </div>
        <div className="rounded-card border border-edge bg-card px-4 py-3 text-center">
          <div className="text-lg font-extrabold text-foreground">
            ⏱ {Math.round(me.totalMinutes / 60)} soat
          </div>
          <div className="text-[10px] text-surfaceMuted-foreground">Umumiy o&#39;yin</div>
        </div>
      </div>

      {/* Recent games */}
      <div className="mb-2 mt-6 text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground/80">
        So&#39;nggi o&#39;yinlar
      </div>
      {shown.length === 0 ? (
        <EmptyState icon="🎱" title="Hozircha tarix yo'q" description="Birinchi o'yiningizdan so'ng shu yerda ko'rinadi" />
      ) : (
        <div className="space-y-1.5">
          {shown.map((s) => {
            const t = store.tables.find((x) => x.id === s.tableId);
            const min = Math.floor(((s.endedAt ?? 0) - s.startedAt) / 60000);
            return (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-card border border-edge bg-card px-4 py-2.5 text-sm"
              >
                <div>
                  <div className="font-bold text-foreground">
                    {t?.type === "tennis" ? "🏓" : "🎱"} Stol {t?.name}
                  </div>
                  <div className="text-[11px] text-surfaceMuted-foreground">
                    {fmtDate(s.startedAt)} &middot; {fmtDurationMin(min)}
                  </div>
                </div>
                <div className="text-right">
                  <PriceTag amount={s.finalTotal ?? 0} size="sm" />
                  {(s.pointsEarned ?? 0) > 0 && (
                    <div className="text-[11px] font-bold text-success">+{s.pointsEarned} ball</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {history.length > 4 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 w-full rounded-control py-2 text-center text-xs font-bold text-primary"
        >
          {showAll ? "Kamroq ko'rsatish" : "Barchasini ko'rish"}
        </button>
      )}

      {/* Club info */}
      <div className="mb-2 mt-6 text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground/80">
        {S.clubName}
      </div>
      <div className="space-y-1.5 rounded-card border border-edge bg-card p-4 text-xs">
        <InfoRow icon="📍" text={S.address} />
        <InfoRow icon="🕐" text={S.workHours} />
        <InfoRow icon="📞" text={S.phone} />
        <InfoRow icon="✈️" text={`${S.telegram}  ${S.instagram}`} />
      </div>
    </UserShell>
  );
}

function InfoRow({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-surfaceMuted-foreground">
      <span>{icon}</span>
      <span className="text-foreground/75">{text}</span>
    </div>
  );
}
