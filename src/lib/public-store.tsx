"use client";

// Mijoz (customer-facing) tomon uchun REAL backend store — /api/public/*
// route'lariga fetch qiladi. Admin tomonining admin-store.tsx'iga o'xshash
// naqsh, lekin autentifikatsiya Telegram initData orqali (xodim sessiyasi
// EMAS) va faqat ommaviy + "o'zimning" ma'lumotlarni ko'radi.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ClubSettings, ClubTable, Customer, GameSession, Reservation } from "./types";

/** Faqat stol holati uchun kerakli minimal maydonlar — orders/customer yo'q. */
type PublicSession = Pick<GameSession, "id" | "tableId" | "startedAt" | "adjustMinutes" | "status">;
type PublicReservation = Pick<Reservation, "id" | "tableId" | "holdUntil" | "status">;

interface PublicState {
  ready: boolean;
  tables: ClubTable[];
  sessions: PublicSession[];
  reservations: PublicReservation[];
  settings: ClubSettings | null;
  me: Customer | null;
  myHistory: GameSession[];
  /** Faol ("Bo'shaganda xabar ber") kuzatuv qo'yilgan stollar. */
  myWatchedTableIds: string[];
}

interface PublicActions {
  refresh: () => Promise<void>;
  /** "Bog'lanish so'rovi" — hech qanday hold/deposit YARATMAYDI, faqat
   *  telefon raqamini (+ixtiyoriy izoh) admin uchun qoldiradi (2026-08,
   *  eski avtomatik hold-bron o'rniga TO'LIQ almashtirildi). */
  requestReservation: (tableId: string, phone: string, note?: string) => Promise<void>;
  watchTable: (tableId: string) => Promise<void>;
  unwatchTable: (tableId: string) => Promise<void>;
}

const PublicStoreCtx = createContext<(PublicState & PublicActions & { error: string | null }) | null>(null);

function getInitData(): string | null {
  if (typeof window === "undefined") return null;
  return (window as any).Telegram?.WebApp?.initData || null;
}

async function api<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? "Xatolik yuz berdi");
  return data as T;
}

export function PublicStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PublicState>({
    ready: false,
    tables: [],
    sessions: [],
    reservations: [],
    settings: null,
    me: null,
    myHistory: [],
    myWatchedTableIds: [],
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{
        tables: ClubTable[];
        sessions: PublicSession[];
        reservations: PublicReservation[];
        settings: ClubSettings | null;
        me: Customer | null;
        myHistory: GameSession[];
        myWatchedTableIds: string[];
      }>("/api/public/state", { initData: getInitData() });
      setState({
        ready: true,
        tables: data.tables,
        sessions: data.sessions,
        reservations: data.reservations,
        settings: data.settings,
        me: data.me,
        myHistory: data.myHistory,
        myWatchedTableIds: data.myWatchedTableIds ?? [],
      });
    } catch (e: any) {
      setError(e?.message ?? "Ulanishda xatolik");
      setState((s) => ({ ...s, ready: true }));
    }
  }, []);

  useEffect(() => {
    load();
    // Stol holati boshqalar tomonidan ham o'zgarishi mumkin — muntazam
    // yangilanib turadi (real-time subscription o'rniga oddiy polling).
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const withError = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message ?? "Xatolik yuz berdi");
      throw e;
    }
  }, []);

  const requestReservation = useCallback(
    async (tableId: string, phone: string, note?: string) => {
      await withError(async () => {
        await api("/api/public/reservations", { initData: getInitData(), tableId, phone, note });
        await load();
      });
    },
    [load, withError]
  );

  // Optimistik — tugma bosilgach holat DARHOL o'zgaradi (loyihadagi umumiy
  // naqsh, admin-store.tsx bilan bir xil), server javobi xato bo'lsa
  // `load()` orqali haqiqiy holatga qaytariladi.
  const watchTable = useCallback(
    async (tableId: string) => {
      setState((s) => (s.myWatchedTableIds.includes(tableId) ? s : { ...s, myWatchedTableIds: [...s.myWatchedTableIds, tableId] }));
      try {
        await api("/api/public/table-watch", { initData: getInitData(), tableId, action: "watch" });
      } catch (e: any) {
        setError(e?.message ?? "Xatolik yuz berdi");
        await load();
      }
    },
    [load]
  );

  const unwatchTable = useCallback(
    async (tableId: string) => {
      setState((s) => ({ ...s, myWatchedTableIds: s.myWatchedTableIds.filter((id) => id !== tableId) }));
      try {
        await api("/api/public/table-watch", { initData: getInitData(), tableId, action: "unwatch" });
      } catch (e: any) {
        setError(e?.message ?? "Xatolik yuz berdi");
        await load();
      }
    },
    [load]
  );

  const value = { ...state, error, refresh: load, requestReservation, watchTable, unwatchTable };

  return <PublicStoreCtx.Provider value={value}>{children}</PublicStoreCtx.Provider>;
}

export function usePublicStore() {
  const ctx = useContext(PublicStoreCtx);
  if (!ctx) throw new Error("usePublicStore PublicStoreProvider ichida ishlatilishi kerak");
  return ctx;
}

/** Har sekund yangilanadigan vaqt — admin-store.tsx'dagi useAdminNow bilan bir xil. */
export function usePublicNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => {
    ref.current = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(ref.current);
  }, [intervalMs]);
  return now;
}
