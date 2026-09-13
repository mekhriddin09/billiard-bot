// ─── Sho'rchi Billiard Club — domain types ─────────────────────────────
// Hech narsa hardcode qilinmaydi: stollar, narxlar, mahsulotlar,
// loyalty qoidalari — hammasi shu tiplar orqali konfiguratsiyalanadi.

export type TableType = "billiard" | "tennis";
export type TableTier = "standard" | "vip";
export type TableStatus = "free" | "active" | "reserved" | "off";

export interface ClubTable {
  id: string;
  number: number;
  name: string; // "№4" yoki "T1"
  type: TableType;
  tier: TableTier;
  pricePerHour: number;
  onlineReservable: boolean;
  enabled: boolean; // vaqtincha o'chirilgan
  archived: boolean; // tarix saqlanadi, grid'da ko'rinmaydi
}

export interface ProductCategory {
  id: string;
  name: string;
  emoji: string;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  emoji: string;
  available: boolean;
  active: boolean;
  /** true bo'lsa — ombor (stockQty/unitCost) kuzatiladi va sotuvda COGS
   *  hisoblanadi. false (masalan lag'mon, choy) — COGS avtomatik
   *  hisoblanmaydi, xarajat operatsion xarajat sifatida qo'lda yoziladi. */
  trackInventory: boolean;
  /** Og'irlik-o'rtacha (weighted average) joriy tannarx — har bir
   *  inventoryPurchase'da qayta hisoblanadi. trackInventory=false bo'lsa 0. */
  unitCost: number;
  /** Joriy ombordagi miqdor. trackInventory=false bo'lsa 0. */
  stockQty: number;
}

export interface OrderItem {
  /** session_orders qatorining o'zi (real qatorlar uchun DB id, optimistik
   *  UI stub'lari uchun vaqtinchalik qiymat) — React key va custom
   *  qatorlarni bir-biridan ajratish uchun (productId="" bo'lganda ham). */
  id: string;
  /** Katalog mahsuloti bo'lsa uning ID'si; "Tezkor/maxsus mahsulot"
   *  (Products katalogida YO'Q, faqat shu sessiyaga xos) bo'lsa — "" (bo'sh
   *  qator, mavjud kelishuv — qarang: correct-orders/route.ts). */
  productId: string;
  name: string;
  emoji: string;
  price: number;
  qty: number;
  /** Sotuv PAYTIDAGI tannarx suratga olingan qiymati (product.unitCost
   *  keyin o'zgarsa ham bu o'zgarmaydi). Faqat trackInventory=true
   *  mahsulotlar uchun to'ldiriladi, aks holda undefined. Tezkor
   *  mahsulotlar uchun HAR DOIM undefined (tannarx tushunchasi yo'q). */
  unitCostAtSale?: number;
}

export type PaymentMethod = "cash" | "card" | "mixed";
export type PaymentStatus = "paid" | "partial" | "debt";

/** Bitta tahrirlash tarixi yozuvi — hech qachon o'chirilmaydi/qayta yozilmaydi. */
export interface SessionEditLogEntry {
  id: string;
  at: number;
  staffName: string;
  role: StaffRole;
  field: string;
  oldValue: string;
  newValue: string;
  reason?: string;
}

export interface GameSession {
  id: string;
  tableId: string;
  startedAt: number; // epoch ms
  endedAt?: number;
  /** Sessiya tegishli bo'lgan biznes kun — "YYYY-MM-DD". Tahrirlash huquqi shunga qarab tekshiriladi. */
  businessDate: string;
  customerId?: string;
  customerPhone?: string;
  orders: OrderItem[];
  /** faqat korreksiya uchun (pauza, xodim xatosi) — daqiqalarda, +/- */
  adjustMinutes: number;
  status: "active" | "closed";
  paid: boolean;
  paymentMethod?: PaymentMethod;
  /** paymentMethod==="mixed" bo'lganda — naqd/karta bo'linishi */
  cashAmount?: number;
  cardAmount?: number;
  /** yopilganda muzlatiladi */
  finalTableCost?: number;
  finalTotal?: number;
  pointsEarned?: number;
  rewardMinutesUsed?: number;
  /** To'lov holati — yopilishda belgilanadi, keyin tuzatilishi mumkin */
  paymentStatus?: PaymentStatus;
  paidAmount?: number;
  debtAmount?: number;
  /** Izoh (masalan: "Qarzga yopildi, ertaga to'laydi") */
  note?: string;
  noteBy?: string;
  noteAt?: number;
  /** Kim yopgan */
  closedBy?: string;
  closedByRole?: StaffRole;
  /** Har bir tuzatish shu yerga qo'shiladi, hech qachon o'chirilmaydi */
  editHistory?: SessionEditLogEntry[];
}

/** Qarzning bir marotabalik to'lov yozuvi — hech qachon o'chirilmaydi. */
export interface DebtPaymentEntry {
  id: string;
  debtId: string;
  amount: number;
  method: PaymentMethod;
  staffName: string;
  note?: string;
  at: number;
  /** "YYYY-MM-DD" — TO'LOV qilingan biznes kun (qarz yaratilgan kun emas —
   *  cash-basis tushum shu sana bo'yicha hisoblanadi). Eski yozuvlarda
   *  yo'q bo'lishi mumkin (STEP1'dan oldin yaratilgan). */
  businessDate?: string;
}

export type DebtStatus = "open" | "paid";

/**
 * Sessiya yopilganda debt_amount > 0 bo'lsa avtomatik yaratiladi. Sessiyaning
 * o'zidagi paymentStatus/paidAmount/debtAmount — YOPILGAN paytdagi muzlatilgan
 * moliyaviy haqiqat (kunlik hisobot shundan hisoblanadi). Bu jadval esa
 * qarzning KEYINGI, jonli holatini kuzatadi (necha so'm qoldi, muddati,
 * eslatma bosqichi) — sessiya yozuviga hech qachon qayta yozilmaydi.
 */
export interface Debt {
  id: string;
  sessionId: string;
  tableId?: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: DebtStatus;
  dueDate?: string; // "YYYY-MM-DD"
  note?: string;
  createdByName: string;
  createdAt: number;
  closedAt?: number;
  payments: DebtPaymentEntry[];
}

/** Qarzning strukturaviy tuzatish yozuvi (Rule 3 — hech qachon o'chirilmaydi). */
export interface DebtCorrection {
  id: string;
  debtId: string;
  oldOriginalAmount: number;
  newOriginalAmount: number;
  oldRemainingAmount: number;
  newRemainingAmount: number;
  reason: string;
  correctedByName: string;
  correctedAt: number;
}

// ─── Moliya (Finance) — Rule 1-4 asosida ────────────────────────────────

export interface ExpenseCategory {
  id: string;
  name: string;
  emoji: string;
  active: boolean;
  sortOrder: number;
}

/**
 * Operatsion xarajat (ijara, svet, tozalash va h.k.). Inventar xaridi va
 * oylik BU YERGA yozilmaydi — ular alohida InventoryPurchase/SalaryPayment
 * sifatida modellashtirilgan (Rule 2 — xarid ≠ xarajat).
 *
 * `amount` manfiy bo'lishi mumkin — bu holda `reversesId` orqali asl
 * yozuvni bekor qiluvchi TUZATISH yozuvi (Rule 3: hech narsa ustidan
 * yozilmaydi, faqat yangi qarama-qarshi yozuv qo'shiladi).
 */
export interface Expense {
  id: string;
  categoryId?: string;
  name: string;
  amount: number;
  paymentMethod: PaymentMethod;
  cashAmount?: number;
  cardAmount?: number;
  businessDate: string;
  occurredAt: number;
  staffName: string;
  note?: string;
  receiptUrl?: string;
  reversesId?: string;
  createdAt: number;
}

/**
 * Inventar xaridi (masalan 100 dona Coca-Cola, 900 000 so'm).
 * CASH FLOW'ga darhol ta'sir qiladi, lekin COGS EMAS — COGS faqat
 * mahsulot SOTILGANDA session_orders.unitCostAtSale orqali tan olinadi
 * (Rule 2).
 */
export interface InventoryPurchase {
  id: string;
  productId: string;
  qty: number;
  unitCost: number;
  totalCost: number;
  paymentMethod: PaymentMethod;
  cashAmount?: number;
  cardAmount?: number;
  supplier?: string;
  businessDate: string;
  occurredAt: number;
  staffName: string;
  note?: string;
  receiptUrl?: string;
  reversesId?: string;
  createdAt: number;
}

/** Haqiqiy to'langan oylik (cash-basis fakt). Hisoblangan (accrual) summa
 *  — StaffMember.monthlySalary asosida finance.ts'da hisoblanadi. */
export interface SalaryPayment {
  id: string;
  staffId?: string;
  staffName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  cashAmount?: number;
  cardAmount?: number;
  periodMonth: string; // "YYYY-MM"
  businessDate: string;
  occurredAt: number;
  paidByName: string;
  note?: string;
  reversesId?: string;
  createdAt: number;
}

export interface Refund {
  id: string;
  sessionId?: string;
  debtId?: string;
  customerName?: string;
  amount: number;
  reason: string;
  paymentMethod: PaymentMethod;
  cashAmount?: number;
  cardAmount?: number;
  businessDate: string;
  occurredAt: number;
  staffName: string;
  note?: string;
  reversesId?: string;
  createdAt: number;
}

/** Kunlik naqd pul solishtiruvi — insert-only, bir kunga bir necha marta
 *  bo'lishi mumkin (eng so'nggisi amaldagi). */
export interface CashReconciliation {
  id: string;
  businessDate: string;
  openingCash: number;
  expectedCash: number;
  countedCash: number;
  difference: number;
  countedByName: string;
  countedAt: number;
  note?: string;
}

export type ReservationStatus = "held" | "arrived" | "expired" | "cancelled";

export interface Reservation {
  id: string;
  tableId: string;
  customerId?: string;
  customerPhone?: string;
  deposit: number;
  createdAt: number;
  holdUntil: number;
  status: ReservationStatus;
}

export type ReservationRequestStatus = "pending" | "contacted" | "cancelled";

/**
 * "Bog'lanish so'rovi" (2026-08) — mijozning "oldindan bron"ini TO'LIQ
 * ALMASHTIRDI: avtomatik hold/deposit YO'Q, mijoz shunchaki telefon
 * raqamini qoldiradi, admin o'zi qo'ng'iroq qiladi. `Reservation`
 * (yuqorida) — xodimning QO'LDA bron qilish vositasi, o'zgarishsiz
 * qoladi, bu bilan ARALASHTIRILMAYDI.
 */
export interface ReservationRequest {
  id: string;
  tableId: string;
  customerId?: string;
  customerPhone: string;
  note?: string;
  status: ReservationRequestStatus;
  createdAt: number;
  contactedAt?: number;
  contactedByName?: string;
}

export interface Customer {
  id: string;
  name: string;
  /** Telegram orqali kirgan mijozlarda dastlab bo'sh bo'lishi mumkin. */
  phone?: string;
  tgId?: string;
  tgUsername?: string;
  points: number;
  totalVisits: number;
  totalMinutes: number;
}

export type StaffRole = "super_admin" | "admin" | "operator" | "cashier";

export interface StaffMember {
  id: string;
  name: string;
  /** Telegram'dagi raqamli ID (@userinfobot orqali olinadi) — real kirish shu orqali bo'ladi. */
  tgId: string;
  tgUsername: string;
  role: StaffRole;
  active: boolean;
  /** Oylik maosh miqdori — HISOBLANISHI (accrual) kerak bo'lgan summa.
   *  Haqiqiy to'lovlar SalaryPayment yozuvlarida (cash-basis fakt). */
  monthlySalary: number;
}

export interface AuditEntry {
  id: string;
  at: number;
  staffName: string;
  role: StaffRole;
  action: string;
  /** "web" (Admin WebApp) yoki "telegram_ai" (AI agent orqali). Eski
   *  yozuvlar va parametr berilmagan chaqiruvlar — "web". */
  source?: "web" | "telegram_ai";
  /** AI orqali bajarilgan bo'lsa: qaysi tool, qanday argumentlar, natija. */
  metadata?: { tool?: string; args?: Record<string, unknown>; result?: string } | null;
}

export interface LoyaltySettings {
  enabled: boolean;
  minutesPerPoint: number; // 60 = 1 soat → 1 ball
  pointsForReward: number; // 10 ball → mukofot
  rewardMinutes: number; // 60 = 1 bepul soat
  minSessionMinutesForReward: number; // 120 = kamida 2 soat o'ynash sharti
}

export interface ReservationSettings {
  enabled: boolean;
  deposit: number;
  holdMinutes: number;
  onlineTableLimit: number; // nechta stol online bron qilinishi mumkin
  paymentTimeoutMinutes: number;
}

export interface DebtReminderPolicy {
  dueDateReminder: boolean;
  overdueReminder: boolean;
  /** Muddati o'tgan qarz uchun necha kunda bir marta qayta eslatiladi (spam bo'lmasligi uchun) */
  overdueRepeatDays: number;
  dailyReminder: boolean;
}

export interface TelegramLogSettings {
  channelId: string | null;
  enabled: boolean;
}

/**
 * 2-Telegram kanal — "Super Admin Alert" (faqat moliyaviy voqealar:
 * xarajat/xarid/oylik/qarz/qaytarim). Maydon joyi shu bosqichda
 * tayyorlanadi, lekin HALI IMPLEMENTATSIYA QILINMAYDI (keyingi sessiyaga
 * qoldirilgan, foydalanuvchi so'rovi bo'yicha) — enabled doim false.
 */
export interface SuperAdminAlertSettings {
  channelId: string | null;
  enabled: boolean;
}

export interface DailyReportSettings {
  enabled: boolean;
  /** "HH:MM", Toshkent vaqti — Vercel Hobby tarifida kuniga bitta cron bilan
   *  taxminiy hisobga olinadi (aniq daqiqa kafolatlanmaydi). */
  time: string;
}

export interface ClubSettings {
  clubName: string;
  address: string;
  phone: string;
  workHours: string;
  telegram: string;
  instagram: string;
  info: string;
  cardPaymentEnabled: boolean;
  loyalty: LoyaltySettings;
  reservation: ReservationSettings;
  telegramLog: TelegramLogSettings;
  superAdminAlert: SuperAdminAlertSettings;
  debtReminderPolicy: DebtReminderPolicy;
  dailyReport: DailyReportSettings;
}

/**
 * "Klub haqida" va boshqa qisqa matn maydonlari uchun xavfsiz max-length
 * (2026-08 — "Club haqida" uzun matn saqlanmayapti/qisqarib qolyapti
 * degan xabar bo'yicha). DB'da (`club_settings.*` — barchasi `text`
 * ustuni) HAQIQIY uzunlik cheklovi YO'Q — bu FAQAT amaliy/xavfsizlik
 * maqsadida qo'yilgan ilova darajasidagi limit, klient (Settings sahifasi)
 * VA server (`/api/settings`) IKKALASI HAM shu YAGONA manbadan foydalanadi
 * (limitlar bir-biridan farq qilib ketmasligi uchun).
 */
export const CLUB_FIELD_LIMITS = {
  clubName: 150,
  address: 300,
  phone: 50,
  workHours: 200,
  telegram: 200,
  instagram: 200,
  /** Uzun, ko'p qatorli tavsif uchun — taxminan 2-3 bet matn. */
  info: 4000,
} as const satisfies Record<keyof Pick<ClubSettings, "clubName" | "address" | "phone" | "workHours" | "telegram" | "instagram" | "info">, number>;

// ─── AI Admin Agent — infratuzilma (A-bosqich) ──────────────────────────
export type AiActionStatus = "pending" | "confirmed" | "cancelled" | "expired";

/**
 * Telegram AI chatda tasdiqlanishi kutilayotgan amal. Hozircha faqat
 * ma'lumot modeli sifatida mavjud — webhook/LLM ulanishi keyingi
 * bosqichda. `args` — tool'ga uzatiladigan argumentlar (LLM tomonidan
 * shakllantiriladi), lekin staffId/role/clubId HECH QACHON shu yerdan
 * olinmaydi — ular har doim `staffId` maydonidan (server tomonidan,
 * Telegram identifikatsiyasidan hal qilingan) keladi.
 */
export interface PendingAiAction {
  id: string;
  chatId: string;
  staffId: string;
  staffName: string;
  toolName: string;
  args: Record<string, unknown>;
  previewText: string;
  status: AiActionStatus;
  telegramMessageId?: number;
  resultSummary?: string;
  errorMessage?: string;
  createdAt: number;
  expiresAt: number;
  resolvedAt?: number;
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  operator: "Operator",
  cashier: "Kassir",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: "To'langan",
  partial: "Qisman to'langan",
  debt: "Qarz",
};
