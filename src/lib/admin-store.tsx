"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AuditEntry,
  ClubSettings,
  ClubTable,
  Customer,
  Debt,
  GameSession,
  OrderItem,
  PaymentMethod,
  PaymentStatus,
  Product,
  ProductCategory,
  Reservation,
  StaffMember,
  StaffRole,
  TableStatus,
} from "./types";
import { todayKey } from "./permissions";

// ─── Admin (real Supabase-backed) store ─────────────────────────────────
// Mijoz (customer) Mini App hamon src/lib/store.tsx (mock) orqali ishlaydi —
// bu fayl FAQAT /admin/* uchun, src/app/admin/layout.tsx orqali ulanadi.
// Har bir action serverga (Next.js API route) so'rov yuboradi; biznes-logika
// (hisob-kitob, audit matni, ruxsatlar) serverda — bu yerda faqat natijani
// local state'ga qo'shish bor, hech qanday moliyaviy hisob-kitob TAKRORLANMAYDI.

interface AdminState {
  ready: boolean;
  tables: ClubTable[];
  sessions: GameSession[];
  reservations: Reservation[];
  products: Product[];
  categories: ProductCategory[];
  customers: Customer[];
  staff: StaffMember[];
  audit: AuditEntry[];
  settings: ClubSettings;
  currentStaff: StaffMember;
  debts: Debt[];
}

interface CloseOpts {
  paymentStatus?: PaymentStatus;
  paidAmount?: number;
  note?: string;
  /** paymentMethod==="mixed" bo'lganda */
  cashAmount?: number;
  cardAmount?: number;
  /** paymentStatus "debt"/"partial" bo'lganda — qarz uchun ixtiyoriy muddat */
  debtDueDate?: string;
}

interface CorrectPatch {
  tableId?: string;
  startedAt?: number;
  endedAt?: number;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  paidAmount?: number;
}

interface AdminActions {
  refresh: () => Promise<void>;
  startSession: (tableId: string, phone?: string) => Promise<void>;
  addOrder: (sessionId: string, productId: string, delta: number) => Promise<void>;
  /** "Tezkor/maxsus mahsulot" — Products katalogida yo'q, faqat shu
   *  sessiyaga xos qator (2026-08). */
  addCustomOrder: (sessionId: string, name: string, price: number, qty: number) => Promise<void>;
  /** Tezkor mahsulot qatorining miqdorini +/- qilish — productId emas,
   *  qatorning o'z `orderId`si bilan (bir nechta tezkor qator bo'lsa ham
   *  bir-biridan ajraladi, 2026-09). */
  adjustCustomOrder: (sessionId: string, orderId: string, delta: number) => Promise<void>;
  adjustTime: (sessionId: string, minutes: number) => Promise<void>;
  closeSession: (
    sessionId: string,
    method: PaymentMethod,
    useReward: boolean,
    opts?: CloseOpts
  ) => Promise<void>;
  reserveTable: (tableId: string, phone?: string) => Promise<void>;
  cancelReservation: (id: string) => Promise<void>;
  arriveReservation: (id: string) => Promise<void>;
  addTable: (t: Omit<ClubTable, "id">) => Promise<void>;
  updateTable: (id: string, patch: Partial<ClubTable>) => Promise<void>;
  addProduct: (p: Omit<Product, "id">) => Promise<void>;
  updateProduct: (id: string, patch: Partial<Product>) => Promise<void>;
  addCategory: (name: string, emoji: string) => Promise<void>;
  updateCategory: (id: string, patch: Partial<ProductCategory>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  addStaff: (name: string, tgId: string, tgUsername: string, role: StaffRole) => Promise<void>;
  updateStaff: (id: string, patch: Partial<StaffMember>) => Promise<void>;
  removeStaff: (id: string) => Promise<void>;
  grantSuperAdmin: (staffId: string) => Promise<void>;
  revokeSuperAdmin: (staffId: string) => Promise<void>;
  updateSettings: (patch: Partial<ClubSettings>) => Promise<void>;
  correctSession: (sessionId: string, patch: CorrectPatch, reason: string) => Promise<void>;
  correctSessionOrders: (sessionId: string, newOrders: OrderItem[], reason: string) => Promise<void>;
  setSessionNote: (sessionId: string, note: string) => Promise<void>;
  payDebt: (debtId: string, amount: number, method: PaymentMethod, note?: string) => Promise<void>;
  updateDebtNote: (debtId: string, patch: { note?: string; dueDate?: string | null }) => Promise<void>;
  correctDebt: (debtId: string, originalAmount: number, reason: string) => Promise<void>;
}

const AdminStoreCtx = createContext<(AdminState & AdminActions & { error: string | null }) | null>(null);

async function api<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || `${res.status} xatolik`);
  }
  return body as T;
}

export function AdminStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AdminState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<Omit<AdminState, "ready">>("/api/state");
      setState((prev) => {
        // Agar biror sessiyaning navbatida hali TUGAMAGAN +/- yoki tezkor
        // mahsulot so'rovi bo'lsa (orderChains) — o'sha sessiyaning
        // `orders`ini shu (eski, hali o'zgarishni ko'rmagan) snapshot
        // bilan YOZIB YUBORMAYMIZ. Aks holda: admin ketma-ket ikkita
        // mahsulot qo'shsa (masalan "Fuse Tea 1L" keyin "Fuse Tea 1,5L"),
        // birinchisining so'rovi biror sababdan xato qaytarib (`catch` →
        // shu `load()`) chaqirilganda, IKKINCHI mahsulot hali serverga
        // yetib bormagan optimistik qo'shimcha sifatida turgan bo'ladi —
        // shu snapshot bilan TO'LIQ almashtirilsa, IKKINCHISI HAM
        // vaqtincha "yo'qolib qoladi" (2026-10, foydalanuvchi xabari: "1L
        // qo'shildi, yo'qoldi, 1,5L qo'shgandan keyin ikkisi ham paydo
        // bo'ldi"). Pending sessiyalarning orders'i o'z navbatidagi
        // so'rov natijasi kelganda TO'G'RI holatga avtomatik keladi —
        // bu yerda tegilmaydi.
        const pendingSessionIds = new Set(orderChains.current.keys());
        const sessions = data.sessions.map((s) => {
          if (!pendingSessionIds.has(s.id)) return s;
          const prevSession = prev?.sessions.find((x) => x.id === s.id);
          return prevSession ? { ...s, orders: prevSession.orders } : s;
        });
        return { ...data, sessions, ready: true };
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yuklashda xatolik");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Jonli sinxronizatsiya (2026-10, "bitta admin stol ochadi, lekin asosiy
  // admin kirsa kamroq stol ko'rinadi" xatosi): sahifa faqat ochilganda
  // BIR MARTA /api/state'dan ma'lumot oladi. Agar boshqa xodim shu payt
  // yangi stol qo'shsa/stolni yoqsa, allaqachon ochiq turgan boshqa
  // brauzer buni sahifa qayta yuklanmaguncha UMUMAN ko'rmaydi — bu stol
  // ro'yxati "qisqa" ko'rinishining asosiy sababi. Tuzatish: davriy
  // (har 20 soniyada, faqat tab ko'rinib turganda) va tab qayta faol/
  // fokusga qaytganda avtomatik qayta yuklash. `load()`ning o'zi hali
  // tugamagan buyurtma so'rovlari bor sessiyalarni ustidan yozib
  // yubormaydi (yuqoridagi pendingSessionIds izohiga qarang), shuning
  // uchun bu davriy refresh faol tahrirlashga xalal bermaydi — xavfsiz.
  useEffect(() => {
    const maybeReload = () => {
      if (document.visibilityState === "visible") load();
    };
    const interval = setInterval(maybeReload, 20000);
    document.addEventListener("visibilitychange", maybeReload);
    window.addEventListener("focus", maybeReload);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", maybeReload);
      window.removeEventListener("focus", maybeReload);
    };
  }, [load]);

  // Xatolik bo'lsa qisqa vaqt ko'rsatib, o'zi yo'qoladi.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const withError = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }, []);

  const mutate = (fn: (s: AdminState) => AdminState) => setState((s) => (s ? fn(s) : s));

  // Sessiya bo'yicha "+/-" so'rovlar navbati VA "faqat oxirgi javobni
  // qo'llash" mexanizmi (2026-08, foydalanuvchi xabari: "Suv +ni 10 marta
  // tez bossam 1→2→...→10 ko'rsatib, keyin BIRDAN 1ga tushib, sekin qayta
  // 2→3→...→10ga ko'tariladi").
  //
  // ROOT CAUSE (real frontend state flow tekshirildi):
  //  1) "+" bosilganda optimistik son DARHOL to'g'ri ko'tariladi (1..10) —
  //     bu qism ilgari ham to'g'ri edi (setState funksional shakli
  //     har bir bosishni oldingi natija ustiga qo'shadi).
  //  2) Muammo — SERVER JAVOBI kelganda: har bir alohida PATCH javobi
  //     (masalan 1-bosishning javobi — server bazasida shu payt uchun
  //     qty=1) kelib, `session.orders`ni O'SHA (eski, kichik) qiymat
  //     bilan TO'LIQ ALMASHTIRAR edi — hatto ekранda allaqachon
  //     optimistik 10 ko'rsatilayotgan bo'lsa ham. Keyin 2-bosishning
  //     javobi (qty=2) kelib yana almashtirar, va hokazo — natijada
  //     foydalanuvchi "10 ga chiqib, birdan 1ga tushib, sekin qayta
  //     ko'tarilishini" ko'rar edi (10 ta ketma-ket so'rovning 10 ta
  //     ketma-ket, BIR-BIR sekin keladigan javobi ekranda "qayta
  //     ijro" bo'lib chiqardi). Bu — ESKI server javobi YANGI
  //     optimistik state'ni bosib ketishi (stale response overwrite).
  //  3) Tuzatish IKKI qatlamli:
  //     (a) so'rovlar KETMA-KET (navbat bilan) yuboriladi — orderChains
  //         (server tomonga ORDER kafolati beradi, lekin bitta o'zi
  //         YETARLI EMAS edi — chunki har bir ORALIQ javob HAM UI'ni
  //         yangilab qo'yardi);
  //     (b) orderSeq — har bir chaqiruv o'zining tartib raqamini oladi;
  //         server javobi kelganda FAQAT shu chaqiruv hali ham ENG
  //         OXIRGI (navbatda undan keyin boshqa so'rov chiqmagan) bo'lsa
  //         UI yangilanadi. Barcha ORALIQ (eskirgan) javoblar UI uchun
  //         E'TIBORSIZ qoldiriladi (xato bo'lsa baribir to'liq qayta
  //         yuklanadi — xavfsizlik yo'qolmaydi). Natija: UI faqat 1 marta
  //         — oxirgi, TO'G'RI (10) qiymat bilan "tasdiqlanadi", hech
  //         qachon orqaga sakramaydi.
  const orderChains = useRef<Map<string, Promise<void>>>(new Map());
  const orderSeq = useRef<Map<string, number>>(new Map());

  const actions = useMemo<AdminActions>(
    () => ({
      refresh: load,

      startSession: (tableId, phone) =>
        withError(async () => {
          // Optimistik UI (2026-08, foydalanuvchi so'rovi — "O'yinni boshlash"
          // tugmasi sekin tuyulishi): stol grid'da DARHOL "band" bo'lib
          // ko'rinadi, server javobini kutmaydi. Vaqtinchalik (temp-) id bilan
          // — real session javob kelgach almashtiriladi, xato bo'lsa olib
          // tashlanadi. Moliyaviy/hisoblanadigan maydonlar (finalTotal va h.k.)
          // stub'da yo'q — ular faqat serverdan keladi, hech narsa "o'ylab
          // topilmaydi".
          const tempId = `optimistic-${Date.now()}`;
          const stub: GameSession = {
            id: tempId,
            tableId,
            startedAt: Date.now(),
            businessDate: todayKey(),
            customerPhone: phone,
            orders: [],
            adjustMinutes: 0,
            status: "active",
            paid: false,
          };
          mutate((s) => ({ ...s, sessions: [...s.sessions, stub] }));

          try {
            const { session } = await api<{ session: GameSession }>("/api/sessions", {
              method: "POST",
              body: JSON.stringify({ tableId, phone }),
            });
            mutate((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === tempId ? session : x)) }));
          } catch (e) {
            mutate((s) => ({ ...s, sessions: s.sessions.filter((x) => x.id !== tempId) }));
            await load();
            throw e;
          }
        }),

      addOrder: (sessionId, productId, delta) =>
        withError(async () => {
          // Optimistik UI (2026-08, foydalanuvchi so'rovi — "+/-" tugmalari
          // sekin tuyulishining asosiy sababi shu edi): server javobini
          // KUTMASDAN, tugma bosilgach DARHOL local state yangilanadi —
          // foydalanuvchi natijani zudlik bilan ko'radi, real tarmoq/server
          // vaqti (Vercel/Supabase masofasi va h.k., bizning kod tomonidan
          // qisqartirib bo'lmaydigan qism) endi ko'zga tashlanmaydi.
          mutate((s) => {
            const session = s.sessions.find((x) => x.id === sessionId);
            if (!session) return s;
            const product = s.products.find((p) => p.id === productId);
            const existing = session.orders.find((o) => o.productId === productId);
            let newOrders: OrderItem[];
            if (existing) {
              const newQty = existing.qty + delta;
              newOrders =
                newQty <= 0
                  ? session.orders.filter((o) => o.productId !== productId)
                  : session.orders.map((o) => (o.productId === productId ? { ...o, qty: newQty } : o));
            } else if (delta > 0 && product) {
              newOrders = [
                ...session.orders,
                // "id" — vaqtinchalik stub, real qator ID'si server javobi
                // kelganda (orderSeq gate orqali) almashtiriladi.
                { id: `optimistic-${productId}`, productId, name: product.name, emoji: product.emoji, price: product.price, qty: delta },
              ];
            } else {
              newOrders = session.orders;
            }
            return { ...s, sessions: s.sessions.map((x) => (x.id === sessionId ? { ...x, orders: newOrders } : x)) };
          });

          // Shu chaqiruvning "tartib raqami" — javob kelganda hali ham
          // ENG OXIRGI chaqiruv ekanini bilish uchun (yuqoridagi izohga
          // qarang).
          const mySeq = (orderSeq.current.get(sessionId) ?? 0) + 1;
          orderSeq.current.set(sessionId, mySeq);

          // Tarmoq so'rovini shu SESSIYA navbatiga qo'shamiz — avvalgi
          // urinish tugagach (muvaffaqiyatli yoki xato bo'lsa ham) keyingisi
          // boshlanadi, so'rovlar HAR DOIM to'g'ri tartibda serverga boradi.
          const prevInChain = orderChains.current.get(sessionId) ?? Promise.resolve();
          const thisCall = prevInChain.catch(() => {}).then(async () => {
            try {
              const { orders } = await api<{ orders: OrderItem[] }>(`/api/sessions/${sessionId}/orders`, {
                method: "PATCH",
                body: JSON.stringify({ productId, delta }),
              });
              // FAQAT navbatdagi ENG OXIRGI chaqiruv bo'lsak UI'ni server
              // natijasi bilan yangilaymiz. Agar shundan keyin YANA bosilgan
              // bo'lsa (navbatda yangi so'rov bor) — bu javob ALLAQACHON
              // ESKIRGAN, uni e'tiborsiz qoldiramiz (aks holda UI vaqtincha
              // "orqaga" sakraydi — aynan shu bug tuzatilmoqda).
              if (orderSeq.current.get(sessionId) === mySeq) {
                mutate((s) => ({
                  ...s,
                  sessions: s.sessions.map((x) => (x.id === sessionId ? { ...x, orders } : x)),
                }));
              }
            } catch (e) {
              // Xato — optimistik taxminni bekor qilib, serverning HAQIQIY
              // holatini to'liq qayta yuklaymiz (noto'g'ri holatda qolib
              // ketmasligi uchun).
              await load();
              throw e;
            }
          });
          orderChains.current.set(sessionId, thisCall);
          // MUHIM (2026-10, "mahsulotlar yo'qolib qolyapti" — xato
          // takrorlanishi): `thisCall` tugagach (muvaffaqiyatli yoki
          // xato bo'lsa ham) shu sessiyani navbatdan OLIB TASHLAYMIZ —
          // aks holda `orderChains.current` HECH QACHON tozalanmas edi
          // (Map'da abadiy qolib ketardi), va `load()`dagi "pending
          // sessiyalar"ni aniqlovchi tekshiruv (pastga qarang) bu
          // sessiyani — hatto allaqachon TUGAGAN bo'lsa ham — doim
          // "hali navbatda" deb hisoblab, uning `orders`ini serverdan
          // kelgan HAQIQIY (yangi) holat bilan HECH QACHON yangilamas
          // edi — ya'ni boshqa xodim/qurilmada qilingan o'zgarishlar
          // (yoki shu sessiyaning o'zi boshqa sababdan qayta
          // yuklanganda) ko'rinmay qolar, "eski" holat abadiy
          // "muzlab" qolardi.
          thisCall
            .finally(() => {
              if (orderChains.current.get(sessionId) === thisCall) {
                orderChains.current.delete(sessionId);
              }
            })
            .catch(() => {});
          await thisCall;
        }),

      addCustomOrder: (sessionId, name, price, qty) =>
        withError(async () => {
          // Optimistik UI — xuddi addOrder bilan bir xil orderChains/orderSeq
          // navbatidan foydalanadi, shuning uchun bittasi bilan ikkinchisi
          // (masalan "+Mahsulot" bilan tezkor mahsulotni bir vaqtda
          // qo'shish) hech qachon bir-birining javobini "eskirtirib"
          // qo'ymaydi (addOrder'dagi flicker-fix bilan bir xil kafolat).
          const tempId = `optimistic-custom-${Date.now()}`;
          mutate((s) => {
            const session = s.sessions.find((x) => x.id === sessionId);
            if (!session) return s;
            const stub: OrderItem = { id: tempId, productId: "", name, emoji: "⚡", price, qty };
            return {
              ...s,
              sessions: s.sessions.map((x) => (x.id === sessionId ? { ...x, orders: [...x.orders, stub] } : x)),
            };
          });

          const mySeq = (orderSeq.current.get(sessionId) ?? 0) + 1;
          orderSeq.current.set(sessionId, mySeq);

          const prevInChain = orderChains.current.get(sessionId) ?? Promise.resolve();
          const thisCall = prevInChain.catch(() => {}).then(async () => {
            try {
              const { orders } = await api<{ orders: OrderItem[] }>(`/api/sessions/${sessionId}/custom-order`, {
                method: "POST",
                body: JSON.stringify({ name, price, qty }),
              });
              if (orderSeq.current.get(sessionId) === mySeq) {
                mutate((s) => ({
                  ...s,
                  sessions: s.sessions.map((x) => (x.id === sessionId ? { ...x, orders } : x)),
                }));
              }
            } catch (e) {
              await load();
              throw e;
            }
          });
          orderChains.current.set(sessionId, thisCall);
          thisCall
            .finally(() => {
              if (orderChains.current.get(sessionId) === thisCall) {
                orderChains.current.delete(sessionId);
              }
            })
            .catch(() => {});
          await thisCall;
        }),

      adjustCustomOrder: (sessionId, orderId, delta) =>
        withError(async () => {
          // Tezkor mahsulot qatorlari productId="" bilan bir xil ko'rinadi
          // (bir nechtasi bo'lsa ham) — shuning uchun addOrder'dagi kabi
          // productId emas, shu qatorning o'z `id`si bilan boshqariladi
          // (2026-09, qarang: adjustCustomOrderQtyCore izohi,
          // src/lib/services/sessions.ts). Optimistik UI/navbat uslubi
          // addOrder bilan bir xil.
          mutate((s) => {
            const session = s.sessions.find((x) => x.id === sessionId);
            if (!session) return s;
            const existing = session.orders.find((o) => o.id === orderId);
            if (!existing) return s;
            const newQty = existing.qty + delta;
            const newOrders =
              newQty <= 0
                ? session.orders.filter((o) => o.id !== orderId)
                : session.orders.map((o) => (o.id === orderId ? { ...o, qty: newQty } : o));
            return { ...s, sessions: s.sessions.map((x) => (x.id === sessionId ? { ...x, orders: newOrders } : x)) };
          });

          const mySeq = (orderSeq.current.get(sessionId) ?? 0) + 1;
          orderSeq.current.set(sessionId, mySeq);

          const prevInChain = orderChains.current.get(sessionId) ?? Promise.resolve();
          const thisCall = prevInChain.catch(() => {}).then(async () => {
            try {
              const { orders } = await api<{ orders: OrderItem[] }>(`/api/sessions/${sessionId}/custom-order`, {
                method: "PATCH",
                body: JSON.stringify({ orderId, delta }),
              });
              if (orderSeq.current.get(sessionId) === mySeq) {
                mutate((s) => ({
                  ...s,
                  sessions: s.sessions.map((x) => (x.id === sessionId ? { ...x, orders } : x)),
                }));
              }
            } catch (e) {
              await load();
              throw e;
            }
          });
          orderChains.current.set(sessionId, thisCall);
          thisCall
            .finally(() => {
              if (orderChains.current.get(sessionId) === thisCall) {
                orderChains.current.delete(sessionId);
              }
            })
            .catch(() => {});
          await thisCall;
        }),

      adjustTime: (sessionId, minutes) =>
        withError(async () => {
          const { adjustMinutes } = await api<{ adjustMinutes: number }>(
            `/api/sessions/${sessionId}/adjust-time`,
            { method: "PATCH", body: JSON.stringify({ minutes }) }
          );
          mutate((s) => ({
            ...s,
            sessions: s.sessions.map((x) => (x.id === sessionId ? { ...x, adjustMinutes } : x)),
          }));
        }),

      closeSession: (sessionId, method, useReward, opts) =>
        withError(async () => {
          // Optimistik UI (2026-08 — "stolni yopsam darhol ochiq holatga
          // o'tmay kutyapti" shikoyati): stol grid'i faqat session.status
          // qiymatiga qarab "band/bo'sh" deb belgilaydi (tables/page.tsx) —
          // shu bitta maydonni DARHOL "closed" qilib qo'yamiz, moliyaviy
          // yakuniy raqamlar (finalTotal, to'lov holati va h.k.) esa faqat
          // serverdan kelgach yoziladi (hech narsa hisoblab chiqarilmaydi).
          mutate((s) => ({
            ...s,
            sessions: s.sessions.map((x) => (x.id === sessionId ? { ...x, status: "closed" as const } : x)),
          }));

          // MUHIM (2026-08, foydalanuvchi xabari: "Sessiya yopiq —
          // /correct-orders ishlating" xatosi ekranda paydo bo'lib qoldi):
          // agar admin mahsulot qo'shib, DARHOL orqasidan stolni ham yopib
          // yuborgan bo'lsa — bular ikkita MUSTAQIL so'rov, shuning uchun
          // hali navbatda (orderChains) tugallanmagan "+/-" so'rovi bo'lishi
          // mumkin edi. Yopish so'rovi UNI kutmasdan darhol ketardi, natijada
          // navbatdagi "+/-" so'rovi sessiya ALLAQACHON YOPILGANIDAN KEYIN
          // serverga yetib borib, server (to'g'ri ravishda) rad etardi — bu
          // esa foydalanuvchiga chalkash qizil xato banneri sifatida
          // ko'rinardi. Tuzatish: yopish so'rovini yuborishdan OLDIN, shu
          // sessiyaning navbatida hali tugamagan "+/-" so'rovi bo'lsa —
          // TO'LIQ tugashini kutamiz (allaqachon boshlangan, bekor qilinmaydi
          // — mahsulot haqiqatan qo'shilgan bo'lishi mumkin, buni yo'qotib
          // yubormaslik kerak).
          const pendingOrders = orderChains.current.get(sessionId);
          if (pendingOrders) {
            await pendingOrders.catch(() => {});
          }

          try {
            const { session, debt } = await api<{ session: GameSession; debt: Debt | null }>(
              `/api/sessions/${sessionId}/close`,
              { method: "POST", body: JSON.stringify({ method, useReward, ...opts }) }
            );
            mutate((s) => ({
              ...s,
              sessions: s.sessions.map((x) => (x.id === sessionId ? session : x)),
              reservations: s.reservations.filter(
                (r) => !(r.tableId === session.tableId && r.status === "arrived")
              ),
              debts: debt ? [debt, ...s.debts] : s.debts,
            }));
          } catch (e) {
            // Xato — masalan optimistik qulf to'qnashuvi ("holat o'zgardi").
            // Optimistik taxminni bekor qilib, haqiqiy holatni qayta yuklaymiz.
            await load();
            throw e;
          }
        }),

      reserveTable: (tableId, phone) =>
        withError(async () => {
          const { reservation } = await api<{ reservation: Reservation }>("/api/reservations", {
            method: "POST",
            body: JSON.stringify({ tableId, phone }),
          });
          mutate((s) => ({ ...s, reservations: [...s.reservations, reservation] }));
        }),

      cancelReservation: (id) =>
        withError(async () => {
          const { reservation } = await api<{ reservation: Reservation }>(
            `/api/reservations/${id}/cancel`,
            { method: "POST" }
          );
          mutate((s) => ({
            ...s,
            reservations: s.reservations.map((r) => (r.id === id ? reservation : r)),
          }));
        }),

      arriveReservation: (id) =>
        withError(async () => {
          const { session, reservation } = await api<{ session: GameSession; reservation: Reservation | null }>(
            `/api/reservations/${id}/arrive`,
            { method: "POST" }
          );
          mutate((s) => ({
            ...s,
            sessions: [...s.sessions, session],
            reservations: reservation ? s.reservations.map((r) => (r.id === id ? reservation : r)) : s.reservations,
          }));
        }),

      addTable: (t) =>
        withError(async () => {
          const { table } = await api<{ table: ClubTable }>("/api/tables", {
            method: "POST",
            body: JSON.stringify(t),
          });
          mutate((s) => ({ ...s, tables: [...s.tables, table] }));
        }),

      updateTable: (id, patch) =>
        withError(async () => {
          const { table } = await api<{ table: ClubTable }>(`/api/tables/${id}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
          });
          mutate((s) => ({ ...s, tables: s.tables.map((t) => (t.id === id ? table : t)) }));
        }),

      addProduct: (p) =>
        withError(async () => {
          const { product } = await api<{ product: Product }>("/api/products", {
            method: "POST",
            body: JSON.stringify(p),
          });
          mutate((s) => ({ ...s, products: [...s.products, product] }));
        }),

      updateProduct: (id, patch) =>
        withError(async () => {
          const { product } = await api<{ product: Product }>(`/api/products/${id}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
          });
          mutate((s) => ({ ...s, products: s.products.map((p) => (p.id === id ? product : p)) }));
        }),

      addCategory: (name, emoji) =>
        withError(async () => {
          const { category } = await api<{ category: ProductCategory }>("/api/categories", {
            method: "POST",
            body: JSON.stringify({ name, emoji }),
          });
          mutate((s) => ({ ...s, categories: [...s.categories, category] }));
        }),

      updateCategory: (id, patch) =>
        withError(async () => {
          const { category } = await api<{ category: ProductCategory }>(`/api/categories/${id}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
          });
          mutate((s) => ({ ...s, categories: s.categories.map((c) => (c.id === id ? category : c)) }));
        }),

      deleteCategory: (id) =>
        withError(async () => {
          // Server mahsuloti bor kategoriyani rad etadi (aniq xato matni
          // bilan) — shu error global error banner'da ko'rsatiladi.
          await api(`/api/categories/${id}`, { method: "DELETE" });
          mutate((s) => ({ ...s, categories: s.categories.filter((c) => c.id !== id) }));
        }),

      addStaff: (name, tgId, tgUsername, role) =>
        withError(async () => {
          await api("/api/staff", {
            method: "POST",
            body: JSON.stringify({ name, tgId, tgUsername, role }),
          });
          await load();
        }),

      updateStaff: (id, patch) =>
        withError(async () => {
          await api(`/api/staff/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
          await load();
        }),

      removeStaff: (id) =>
        withError(async () => {
          await api(`/api/staff/${id}`, { method: "DELETE" });
          await load();
        }),

      grantSuperAdmin: (staffId) =>
        withError(async () => {
          await api(`/api/staff/${staffId}/grant-super`, { method: "POST" });
          await load();
        }),

      revokeSuperAdmin: (staffId) =>
        withError(async () => {
          await api(`/api/staff/${staffId}/revoke-super`, { method: "POST" });
          await load();
        }),

      updateSettings: (patch) =>
        withError(async () => {
          const { settings } = await api<{ settings: ClubSettings }>("/api/settings", {
            method: "PATCH",
            body: JSON.stringify(patch),
          });
          mutate((s) => ({ ...s, settings }));
        }),

      correctSession: (sessionId, patch, reason) =>
        withError(async () => {
          const { session } = await api<{ session: GameSession }>(`/api/sessions/${sessionId}/correct`, {
            method: "PATCH",
            body: JSON.stringify({ patch, reason }),
          });
          mutate((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === sessionId ? session : x)) }));
        }),

      correctSessionOrders: (sessionId, newOrders, reason) =>
        withError(async () => {
          const { session } = await api<{ session: GameSession }>(
            `/api/sessions/${sessionId}/correct-orders`,
            { method: "PATCH", body: JSON.stringify({ newOrders, reason }) }
          );
          mutate((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === sessionId ? session : x)) }));
        }),

      setSessionNote: (sessionId, note) =>
        withError(async () => {
          const { session } = await api<{ session: GameSession }>(`/api/sessions/${sessionId}/note`, {
            method: "PATCH",
            body: JSON.stringify({ note }),
          });
          mutate((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === sessionId ? session : x)) }));
        }),

      payDebt: (debtId, amount, method, note) =>
        withError(async () => {
          const { debt } = await api<{ debt: Debt }>(`/api/debts/${debtId}/pay`, {
            method: "POST",
            body: JSON.stringify({ amount, method, note }),
          });
          mutate((s) => ({ ...s, debts: s.debts.map((d) => (d.id === debtId ? debt : d)) }));
        }),

      updateDebtNote: (debtId, patch) =>
        withError(async () => {
          const { debt } = await api<{ debt: Debt }>(`/api/debts/${debtId}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
          });
          mutate((s) => ({ ...s, debts: s.debts.map((d) => (d.id === debtId ? debt : d)) }));
        }),

      correctDebt: (debtId, originalAmount, reason) =>
        withError(async () => {
          const { debt } = await api<{ debt: Debt }>(`/api/debts/${debtId}`, {
            method: "PATCH",
            body: JSON.stringify({ originalAmount, reason }),
          });
          mutate((s) => ({ ...s, debts: s.debts.map((d) => (d.id === debtId ? debt : d)) }));
        }),
    }),
    [load, withError]
  );

  const value = useMemo(() => {
    if (!state) return null;
    return { ...state, error, ...actions };
  }, [state, error, actions]);

  if (!value) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-3 text-4xl">🎱</div>
          <div className="text-lg tracking-widest text-primary">
            SHO&#39;RCHI BILLIARD CLUB
          </div>
          <div className="mt-2 text-sm text-surfaceMuted-foreground">
            {error ? "Kirishda xatolik — Telegram orqali ochilganingizga ishonch hosil qiling." : "Yuklanmoqda…"}
          </div>
          {error && <div className="mt-1 text-xs text-destructive">{error}</div>}
        </div>
      </div>
    );
  }

  return <AdminStoreCtx.Provider value={value}>{children}</AdminStoreCtx.Provider>;
}

export function useAdminStore(): AdminState & AdminActions & { error: string | null } {
  const ctx = useContext(AdminStoreCtx);
  if (!ctx) throw new Error("useAdminStore AdminStoreProvider ichida ishlatilishi kerak");
  return ctx;
}

export function useAdminActiveSession(tableId: string): GameSession | undefined {
  const { sessions } = useAdminStore();
  return sessions.find((s) => s.tableId === tableId && s.status === "active");
}

export function useAdminTableStatus(tableId: string): TableStatus {
  const { sessions, reservations, tables } = useAdminStore();
  const table = tables.find((t) => t.id === tableId);
  if (!table || !table.enabled) return "off";
  if (sessions.some((s) => s.tableId === tableId && s.status === "active")) return "active";
  if (reservations.some((r) => r.tableId === tableId && r.status === "held" && r.holdUntil > Date.now()))
    return "reserved";
  return "free";
}

export function useAdminNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => {
    ref.current = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(ref.current);
  }, [intervalMs]);
  return now;
}
