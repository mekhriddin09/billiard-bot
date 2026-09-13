"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { usePublicStore } from "@/lib/public-store";

export default function UserShell({
  children,
  header,
}: {
  children: React.ReactNode;
  header?: React.ReactNode;
}) {
  const pathname = usePathname();
  const { settings, error } = usePublicStore();
  const clubShortName = settings?.clubName?.split(" ")[0]?.toUpperCase() ?? "SHO'RCHI";

  const NAV = [
    { href: "/", label: "Klub", icon: "🎱" },
    { href: "/profile", label: "Profil", icon: "👤" },
  ];

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
      <header className="px-4 pb-2 pt-5">
        {header ?? (
          <div className="flex items-center justify-between">
            {/* Muvozanat uchun bo'sh joy — mijozlarga admin panelga kirish
                havolasi ko'rsatilmaydi (xodimlar avtomatik /admin'ga
                yo'naltiriladi, mijoz bu yerga umuman yetib kelmaydi). */}
            <span className="h-8 w-8" aria-hidden="true" />
            <div className="text-center">
              <div className="text-[11px] font-extrabold tracking-[0.3em] text-primary">
                {clubShortName}
              </div>
              <div className="-mt-0.5 text-[17px] font-extrabold tracking-wide text-foreground">
                BILLIARD CLUB
              </div>
            </div>
            <button
              className="relative flex h-8 w-8 items-center justify-center rounded-control text-foreground/60"
              aria-label="Bildirishnomalar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3a5 5 0 0 0-5 5v3.2c0 .6-.2 1.2-.6 1.7L5 15h14l-1.4-2.1a2.8 2.8 0 0 1-.6-1.7V8a5 5 0 0 0-5-5Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path d="M9.5 18a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-destructive" />
            </button>
          </div>
        )}
      </header>

      {error && (
        <div className="mx-4 mt-1 rounded-control border border-destructive/25 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error}
        </div>
      )}

      <main className="flex-1 px-4 pb-28 pt-2">{children}</main>

      <nav className="glass-float fixed inset-x-3 bottom-3 z-30 mx-auto flex w-fit gap-1 rounded-pill px-1.5 py-1.5 shadow-navFloat">
        {NAV.map((n) => {
          const active = pathname === n.href;
          return (
            <Link key={n.href} href={n.href} className="relative">
              {active && (
                <motion.span
                  layoutId="user-nav-pill"
                  className="absolute inset-0 rounded-pill bg-primary/10"
                  transition={{ type: "spring", stiffness: 320, damping: 30 }}
                />
              )}
              <span
                className={`relative flex items-center gap-1.5 rounded-pill px-6 py-2.5 text-[12.5px] font-bold transition-colors ${
                  active ? "text-primary" : "text-surfaceMuted-foreground"
                }`}
              >
                <span className="text-[15px]">{n.icon}</span>
                {n.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
