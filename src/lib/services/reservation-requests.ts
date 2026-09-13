import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logReservationRequestCreated, bestEffort } from "../telegram-log";
import { mapReservationRequest } from "../db-map";
import { ServiceError } from "./errors";
import type { ReservationRequest } from "../types";

/**
 * "Bog'lanish so'rovi" (2026-08) — mijozning "oldindan bron"ini TO'LIQ
 * ALMASHTIRDI. Mijoz tomonidan chaqiriladi (xodim EMAS, table-watch.ts
 * bilan bir xil tamoyil) — telefon raqamini qoldiradi, hech qanday
 * hold/deposit YARATILMAYDI, admin keyin o'zi qo'ng'iroq qiladi.
 */
export interface CreateReservationRequestArgs {
  tableId: string;
  customerId: string;
  customerName?: string;
  customerPhone: string;
  note?: string;
}

export async function createReservationRequestCore(
  supabase: SupabaseClient,
  args: CreateReservationRequestArgs
): Promise<{ request: ReservationRequest }> {
  const phone = args.customerPhone.trim();
  if (!phone) throw new ServiceError("Telefon raqami kerak", 400);

  const [{ data: table }, { data: settingsRow }] = await Promise.all([
    supabase.from("club_tables").select("*").eq("id", args.tableId).maybeSingle(),
    supabase.from("club_settings").select("reservation").eq("id", 1).single(),
  ]);
  if (!table) throw new ServiceError("Stol topilmadi", 404);

  const R = settingsRow?.reservation ?? { enabled: false };
  if (!R.enabled) throw new ServiceError("Onlayn bron hozircha yopiq", 403);
  if (!table.online_reservable) {
    throw new ServiceError("Bu stol onlayn bron qilinmaydi", 403);
  }

  return doInsert();

  async function doInsert(): Promise<{ request: ReservationRequest }> {
    const { data: inserted, error } = await supabase
      .from("reservation_requests")
      .insert({
        table_id: args.tableId,
        customer_id: args.customerId,
        customer_phone: phone,
        note: args.note?.trim() || null,
        status: "pending",
      })
      .select("*")
      .single();
    if (error || !inserted) throw new ServiceError(error?.message ?? "Xatolik", 500);

    // Mijoz profilida telefon hali bo'sh bo'lsa — shu bilan to'ldiramiz
    // (keyingi safar qayta so'ramaslik uchun, best-effort).
    bestEffort(
      (async () => {
        const { data: customer } = await supabase.from("customers").select("phone").eq("id", args.customerId).maybeSingle();
        if (customer && !customer.phone) {
          await supabase.from("customers").update({ phone }).eq("id", args.customerId);
        }
      })(),
      "reservation-request: customer.phone backfill"
    );

    bestEffort(
      logReservationRequestCreated(supabase, {
        tableName: table.name,
        customerName: args.customerName,
        customerPhone: phone,
        note: args.note,
      }),
      "logReservationRequestCreated"
    );

    return { request: mapReservationRequest(inserted) };
  }
}
