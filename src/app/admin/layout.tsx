"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AdminStoreProvider, useAdminNow, useAdminStore } from "@/lib/admin-store";
import AdminAuthGate from "@/components/admin/AdminAuthGate";
import { ROLE_LABELS } from "@/lib/types";
import { fmtDate, fmtHM } from "@/lib/format";

// Professional chiziqli ikon tizimi — emoji o'rniga. Barchasi bir xil
// stroke uslubida (strokeWidth 1.6, yumaloq uchlar), 16x16 viewBox.
function IconHome({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M2 7.2 8 2l6 5.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.4 6.4V13a.8.8 0 0 0 .8.8h2.3v-3.4a1.5 1.5 0 0 1 1.5-1.5h0a1.5 1.5 0 0 1 1.5 1.5v3.4h2.3a.8.8 0 0 0 .8-.8V6.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconTables({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <rect x="2" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="9" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="2" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="9" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function IconDebts({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M8 1.6 14.6 13a1 1 0 0 1-.87 1.5H2.27A1 1 0 0 1 1.4 13L8 1.6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6.2v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="11.6" r="0.9" fill="currentColor" />
    </svg>
  );
}
function IconReports({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M2.5 13.5v-4M7 13.5v-7M11.5 13.5V4M14 13.5H2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconFinance({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M8 1.6v12.8M11.5 4.2c0-1.1-1.3-1.8-3.5-1.8s-3.5.9-3.5 2.1c0 1.2 1 1.6 3.5 2 2.5.4 3.5.9 3.5 2.1 0 1.2-1.3 2.1-3.5 2.1s-3.5-.7-3.5-1.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconSettings({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="2.3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 1.8v1.4M8 12.8v1.4M14.2 8h-1.4M3.2 8H1.8M12.2 3.8l-1 1M4.8 11.2l-1 1M12.2 12.2l-1-1M4.8 4.8l-1-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Bosh sahifa (dashboard) va Qarzlar alohida nav item sifatida olib
// tashlandi — /admin endi to'g'ridan-to'g'ri Stollarga yo'naltiradi,
// Qarzlar esa Hisobotlar ichida tab sifatida (hali ham har qanday xodimga
// ochiq — faqat nav joyi o'zgardi). Moliya — faqat super_admin.
const NAV_BASE = [
  { href: "/admin/tables", label: "Stollar", Icon: IconTables },
  { href: "/admin/reports", label: "Hisobotlar", Icon: IconReports },
  { href: "/admin/settings", label: "Sozlamalar", Icon: IconSettings },
];
const NAV_FINANCE = { href: "/admin/finance", label: "Moliya", Icon: IconFinance };

const WEEKDAY = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-admin">
      <AdminAuthGate>
        <AdminStoreProvider>
          <AdminShell>{children}</AdminShell>
        </AdminStoreProvider>
      </AdminAuthGate>
    </div>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const store = useAdminStore();
  const { currentStaff, error } = store;

  const nav = [
    NAV_BASE[0],
    NAV_BASE[1],
    ...(currentStaff.role === "super_admin" ? [NAV_FINANCE] : []),
    NAV_BASE[2],
  ];

  const isActive = (href: string) => pathname.startsWith(href);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
    window.location.reload();
  };

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-edge bg-background p-4 lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-1.5 pt-1.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-primary/12 text-base">
            🎱
          </span>
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.26em] text-primary">
              SHO&#39;RCHI
            </div>
            <div className="-mt-0.5 text-[14.5px] font-bold tracking-wide text-foreground">
              BILLIARD CLUB
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {nav.map((n) => {
            const active = isActive(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-3 rounded-card px-2.5 py-2.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-primary/12 text-foreground"
                    : "text-surfaceMuted-foreground hover:bg-cardElevated/70 hover:text-foreground"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-control transition-colors ${
                    active ? "bg-primary/20 text-primary" : "bg-foreground/[0.04] text-foreground/60"
                  }`}
                >
                  <n.Icon className="h-3.5 w-3.5" />
                </span>
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-card border border-edge bg-card px-3 py-3">
          <div className="mb-2.5 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/50 text-sm">
              👤
            </div>
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-semibold text-foreground">
                {currentStaff.name}
              </div>
              <div className="text-[10px] font-medium text-primary">
                {ROLE_LABELS[currentStaff.role]}
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full rounded-control border border-edge bg-cardElevated px-2.5 py-2 text-[11px] font-medium text-foreground/70 transition-colors hover:text-foreground"
          >
            Chiqish
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <DesktopHeader />

        <header className="glass sticky top-0 z-30 flex items-center justify-between px-4 py-3 lg:hidden">
          <div className="text-sm font-bold tracking-wide text-primary">
            🎱 SHO&#39;RCHI BILLIARD CLUB
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-surfaceMuted-foreground">{currentStaff.name}</span>
            <button onClick={logout} className="rounded-control border border-edge px-2 py-1 text-[11px] text-foreground/70">
              Chiqish
            </button>
          </div>
        </header>

        {error && (
          <div className="mx-4 mt-3 rounded-control border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive lg:mx-8">
            {error}
          </div>
        )}

        <main className="flex-1 px-4 pb-28 pt-5 lg:px-8 lg:pb-8 lg:pt-6">{children}</main>

        <nav className="glass-float fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-md items-center justify-around rounded-pill px-1 py-1.5 shadow-navFloat lg:hidden">
          {nav.map((n) => {
            const active = isActive(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-pill px-2 py-1.5 text-[10px] font-bold transition-colors ${
                  active ? "text-primary" : "text-surfaceMuted-foreground"
                }`}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-full ${active ? "bg-primary/15" : ""}`}>
                  <n.Icon className="h-4 w-4" />
                </span>
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function DesktopHeader() {
  const store = useAdminStore();
  const now = useAdminNow(1000);
  const d = new Date(now);

  return (
    <header className="sticky top-0 z-20 hidden items-center gap-4 bg-background/90 px-8 py-3 backdrop-blur lg:flex">
      <div className="relative w-full max-w-xs">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-surfaceMuted-foreground"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
        >
          <circle cx="7" cy="7" r="5.2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          placeholder="Qidirish..."
          disabled
          className="w-full cursor-not-allowed rounded-card border border-edge bg-card py-2 pl-9 pr-3 text-[13px] text-foreground placeholder:text-surfaceMuted-foreground/70 outline-none"
        />
      </div>

      <div className="ml-auto flex items-center gap-4">
        <button
          disabled
          className="relative flex h-9 w-9 shrink-0 cursor-not-allowed items-center justify-center rounded-card border border-edge bg-card text-foreground/70"
          aria-label="Bildirishnomalar"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 1.5c-2 0-3.4 1.5-3.4 3.6v2c0 .5-.2 1.1-.6 1.7l-.8 1.2c-.4.6 0 1.4.7 1.4h9.4c.7 0 1.1-.8.7-1.4l-.8-1.2c-.4-.6-.6-1.2-.6-1.7v-2c0-2.1-1.4-3.6-3.4-3.6Z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <path d="M6.3 12.8a1.8 1.8 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive" />
        </button>

        <button
          disabled
          className="flex cursor-not-allowed items-center gap-2.5 rounded-card border border-edge bg-card py-1.5 pl-1.5 pr-3"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-control bg-primary/50 text-xs text-foreground">
            {store.currentStaff.name.slice(0, 1)}
          </span>
          <span className="text-left leading-tight">
            <div className="text-[12px] font-semibold text-foreground">{store.currentStaff.name}</div>
            <div className="text-[10px] text-surfaceMuted-foreground">{ROLE_LABELS[store.currentStaff.role]}</div>
          </span>
        </button>

        <div className="h-7 w-px bg-foreground/[0.06]" />

        <div className="text-right leading-tight">
          <div className="text-[10.5px] text-surfaceMuted-foreground">
            {WEEKDAY[d.getDay()]}, {fmtDate(now)}
          </div>
          <div className="tabular text-[19px] font-bold text-foreground">{fmtHM(now)}</div>
        </div>

        <span className="flex items-center gap-1.5 rounded-full bg-success/12 px-2.5 py-1 text-[10.5px] font-semibold text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Tizim faol
        </span>
      </div>
    </header>
  );
}
