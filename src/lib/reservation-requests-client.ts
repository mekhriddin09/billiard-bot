"use client";

import type { ReservationRequest } from "./types";

async function api<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `${res.status} xatolik`);
  return body as T;
}

/** "Bog'lanish so'rovlari" (2026-08) — admin panelda, Sozlamalar → Bron
 *  tabida ko'rsatiladi. finance-client.ts bilan bir xil naqsh: bu domen
 *  markaziy /api/state ichida emas, o'z alohida wrapper'iga ega. */
export const reservationRequestsApi = {
  list: (status?: "pending" | "contacted" | "cancelled") =>
    api<{ requests: ReservationRequest[] }>(`/api/reservation-requests${status ? `?status=${status}` : ""}`),
  contact: (id: string) => api<{ request: ReservationRequest }>(`/api/reservation-requests/${id}/contact`, { method: "POST" }),
  cancel: (id: string) => api<{ request: ReservationRequest }>(`/api/reservation-requests/${id}/cancel`, { method: "POST" }),
};
