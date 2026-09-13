import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ServiceError } from "../../services/errors";

/**
 * `resolve()` bosqichida ismlarni/raqamlarni REAL DB ID'lariga aylantirish
 * uchun umumiy yordamchi funksiyalar. Bir joyda — barcha operatsion va
 * moliyaviy tool'lar shu funksiyalarni ishlatadi, har biri o'zi qayta
 * SELECT yozib yurmaydi.
 */

export interface ResolvedTable {
  id: string;
  name: string;
  number: number;
  type: string;
}

const TYPE_LABEL: Record<string, string> = { tennis: "tennis", billiard: "billiard" };

/**
 * Stol nomlarini solishtirish uchun normallashtirish. Standart billiard
 * stol nomlari "№1", "№2" ... shaklida ("№" — NUMERO SIGN, U+2116)
 * saqlanadi, lekin bu belgini telefon klaviaturasida yozib bo'lmaydi —
 * xodimlar odatda "No1", "N1", "no.1", "1-stol" kabi variant yozadi.
 * "№" ni "no" ga aylantirib, keyin harf/raqamdan boshqa hamma narsani
 * (bo'shliq, nuqta, tire, ...) olib tashlab solishtirsak, ikkalasi ham
 * "no1" ga tushadi — moslik topiladi.
 */
function normalizeTableToken(s: string): string {
  return s
    .toLowerCase()
    .replace(/№/g, "no")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Stolni RAQAM, NOM yoki TUR bo'yicha DB'dan hal qiladi.
 *
 * MUHIM (bag'ishlangan xatoni tuzatish): `club_tables.number` ustuni
 * FAQAT bitta `type` ICHIDA noyob (Sozlamalar UI'sida raqam har bir tur
 * uchun alohida hisoblanadi — `Math.max(...tables billiard) + 1` va
 * shunga o'xshash tennis uchun alohida). Shuning uchun bitta klubda
 * bir vaqtning o'zida "billiard №1" VA "tennis T1" ikkalasi ham
 * `number=1` bilan mavjud bo'lishi MUMKIN. Eski kod (`.maybeSingle()`)
 * bunday holatda Postgrest "bir nechta qator" xatosini jimgina
 * yutib, `data: null` qaytarar edi — foydalanuvchiga "stol topilmadi"
 * deb noto'g'ri xabar ketardi, aslida stol mavjud edi.
 *
 * Bundan tashqari xodimlar kunlik ishda stolni FAQAT `name` (masalan
 * "T1", "№5") orqali taniydi — `number` hech qayerda ko'rsatilmaydi
 * (Sozlamalar'dagi kichik "№" ustunidan boshqa). Shu sabab `tableName`
 * ENDI birinchi darajali identifikator, `tableNumber` esa orqaga
 * moslik va "5 stolni och" kabi sof-raqamli buyruqlar uchun qoladi.
 */
export async function resolveTable(
  supabase: SupabaseClient,
  opts: { tableNumber?: number; tableName?: string; tableType?: string }
): Promise<ResolvedTable> {
  // ─── 1) Nom bo'yicha (eng ishonchli — xodimlar shu bilan ishlaydi) ───
  if (opts.tableName) {
    const name = opts.tableName.trim();
    const { data: exactRows } = await supabase.from("club_tables").select("id, name, number, type").ilike("name", name).limit(5);
    let rows = exactRows ?? [];
    if (rows.length === 0) {
      const { data: partialRows } = await supabase.from("club_tables").select("id, name, number, type").ilike("name", `%${name}%`).limit(5);
      rows = partialRows ?? [];
    }
    if (rows.length === 0) {
      // ILIKE hech narsa topmadi — "№" belgisi bilan yozilishi ehtimoli
      // bor (yuqoridagi izohga qarang). Barcha stollarni olib,
      // normallashtirilgan nom bo'yicha solishtiramiz (stollar soni kam
      // — bitta klubda odatda o'nlab, shuning uchun bu xavfsiz).
      const { data: allRows } = await supabase.from("club_tables").select("id, name, number, type").limit(200);
      const target = normalizeTableToken(name);
      rows = (allRows ?? []).filter((r) => {
        const rn = normalizeTableToken(r.name);
        return rn === target || rn.includes(target) || target.includes(rn);
      });
    }
    if (rows.length === 0) throw new ServiceError(`"${opts.tableName}" nomli stol topilmadi`, 404);
    const exact = rows.find(
      (r) => r.name.toLowerCase() === name.toLowerCase() || normalizeTableToken(r.name) === normalizeTableToken(name)
    );
    if (exact) return exact;
    if (rows.length === 1) return rows[0];
    throw new ServiceError(`"${opts.tableName}" bo'yicha bir nechta stol topildi: ${rows.map((r) => r.name).join(", ")} — aniqroq yozing`, 400);
  }

  // ─── 2) Raqam bo'yicha (turlar orasida kollizsiya bo'lishi mumkin) ───
  if (opts.tableNumber !== undefined) {
    let query = supabase.from("club_tables").select("id, name, number, type").eq("number", opts.tableNumber);
    if (opts.tableType) query = query.eq("type", opts.tableType);
    const { data } = await query.limit(5);
    const rows = data ?? [];
    if (rows.length === 0) throw new ServiceError(`Stol №${opts.tableNumber} topilmadi`, 404);
    if (rows.length === 1) return rows[0];
    // Bir nechta TUR bir xil raqamga ega — aniq nom bilan qayta so'raladi.
    throw new ServiceError(
      `Stol №${opts.tableNumber} bir nechta turda mavjud (${rows.map((r) => `${TYPE_LABEL[r.type] ?? r.type}: ${r.name}`).join(", ")}) — aniq nomi bilan ayting (masalan "${rows[0].name}")`,
      400
    );
  }

  // ─── 3) Faqat tur bo'yicha (masalan "tenis stol") ────────────────────
  if (opts.tableType) {
    const { data } = await supabase
      .from("club_tables")
      .select("id, name, number, type")
      .eq("type", opts.tableType)
      .eq("enabled", true)
      .limit(10);
    const rows = data ?? [];
    const label = TYPE_LABEL[opts.tableType] ?? opts.tableType;
    if (rows.length === 0) throw new ServiceError(`${label} stoli topilmadi`, 404);
    if (rows.length === 1) return rows[0];
    throw new ServiceError(`${label} stollari bir nechta: ${rows.map((r) => r.name).join(", ")} — qaysi birini aniq ayting`, 400);
  }

  throw new ServiceError("Stol aniqlanmadi — raqam yoki nom kerak", 400);
}

export async function resolveActiveSessionByTable(
  supabase: SupabaseClient,
  tableId: string,
  tableLabel: string
): Promise<{ id: string }> {
  const { data } = await supabase
    .from("game_sessions")
    .select("id")
    .eq("table_id", tableId)
    .eq("status", "active")
    .maybeSingle();
  if (!data) throw new ServiceError(`${tableLabel}da faol sessiya yo'q`, 404);
  return data;
}

/** Nom bo'yicha mahsulot qidiradi (faol, ILIKE). Aniq mos kelsa uni tanlaydi,
 *  bir nechta noaniq mos kelsa xatolik bilan variantlarni ko'rsatadi. */
export async function resolveProductByName(
  supabase: SupabaseClient,
  name: string
): Promise<{ id: string; name: string; emoji: string; price: number }> {
  const { data } = await supabase
    .from("products")
    .select("id, name, emoji, price")
    .eq("active", true)
    .ilike("name", `%${name}%`)
    .limit(5);
  const rows = data ?? [];
  if (rows.length === 0) throw new ServiceError(`"${name}" nomli mahsulot topilmadi`, 404);
  const exact = rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
  if (exact) return exact;
  if (rows.length === 1) return rows[0];
  throw new ServiceError(`"${name}" bo'yicha bir nechta mahsulot topildi: ${rows.map((r) => r.name).join(", ")} — aniqroq yozing`, 400);
}

/** Nom bo'yicha xodim qidiradi (faol, ILIKE). */
export async function resolveStaffByName(
  supabase: SupabaseClient,
  name: string
): Promise<{ id: string; name: string }> {
  const { data } = await supabase.from("staff").select("id, name").eq("active", true).ilike("name", `%${name}%`).limit(5);
  const rows = data ?? [];
  if (rows.length === 0) throw new ServiceError(`"${name}" nomli faol xodim topilmadi`, 404);
  const exact = rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
  if (exact) return exact;
  if (rows.length === 1) return rows[0];
  throw new ServiceError(`"${name}" bo'yicha bir nechta xodim topildi: ${rows.map((r) => r.name).join(", ")} — aniqroq yozing`, 400);
}

/** Mijoz ismi bo'yicha OCHIQ qarzni qidiradi (to'lov qabul qilish uchun). */
export async function resolveOpenDebtByCustomerName(
  supabase: SupabaseClient,
  name: string
): Promise<{ id: string; customerName: string; remainingAmount: number }> {
  const { data } = await supabase
    .from("debts")
    .select("id, customer_name, remaining_amount")
    .eq("status", "open")
    .ilike("customer_name", `%${name}%`)
    .order("created_at", { ascending: false })
    .limit(5);
  const rows = data ?? [];
  if (rows.length === 0) throw new ServiceError(`"${name}" bo'yicha ochiq qarz topilmadi`, 404);
  if (rows.length === 1) return { id: rows[0].id, customerName: rows[0].customer_name, remainingAmount: rows[0].remaining_amount };
  throw new ServiceError(
    `"${name}" bo'yicha bir nechta ochiq qarz topildi (${rows.map((r) => `${r.customer_name}: ${r.remaining_amount}`).join("; ")}) — aniqroq yozing`,
    400
  );
}
