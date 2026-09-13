# Sho'rchi Billiard Club — Backend Audit va Migration Plan

Status: **AUDIT TUGADI. Kod o'zgartirilmagan.** Tasdiqlashingizni kutyapman.

---

## 0. Muhim kontekst — hozirgi holat

Bu audit "noldan boshlash" emas — **admin panel allaqachon real Supabase backend'ga ulangan** (oldingi sessiyada qilingan). Quyida buni tasdiqlovchi tekshiruv natijalari, so'ng **haqiqiy qolgan bo'shliqlar** (race condition, mijoz tomoni, RLS chuqurligi).

Qisqa xulosa:

| Qism | Holat |
|---|---|
| Admin panel (stollar, sessiyalar, xodimlar, hisobotlar, sozlamalar) | ✅ Real Supabase, production'da ishlayapti |
| Mijoz Mini App (bosh sahifa, profil, stol QR) | ❌ Hali mock (`src/lib/store.tsx`) — bu auditning asosiy yangi ishi |
| Telegram autentifikatsiya (xodim) | ✅ Real — initData HMAC tekshiriladi, rol DB'dan jonli o'qiladi, demo switcher yo'q |
| Race condition himoyasi | ⚠️ **Bo'shliq bor** — pastda batafsil (#5) |
| RLS | ⚠️ Default-deny (ishlaydi, lekin granular rol-matritsasi emas) — qaror kerak (#6) |

---

## 1. Supabase connection audit

- `@supabase/supabase-js` — o'rnatilgan (`package.json`, `^2.45.4`).
- Client faqat bitta joyda yaratiladi: `src/lib/supabase-server.ts`, `"server-only"` bilan belgilangan (client komponentga import qilinsa build xato beradi — tekshirdim, hech qayerda buzilmagan).
- **Grep natijasi**: butun `src/`da `createClient(` faqat shu bitta faylda chaqiriladi. Boshqa hech qanday komponent yoki route to'g'ridan-to'g'ri Supabase client yaratmaydi.
- `SUPABASE_SERVICE_ROLE_KEY` — hech qayerda `NEXT_PUBLIC_` prefiksisiz, hech qanday client komponentga import qilinmagan → **brauzerga chiqib ketmaydi**. Tasdiqlandi.
- Environment variables:
  - Local (`.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, `SESSION_SECRET` — hammasi bor. `NEXT_PUBLIC_APP_URL` — **bo'sh** (faqat Vercel production'da to'ldirilgan, local uchun kerak emas, muammo emas).
  - Vercel production: `vercel env ls production` orqali tasdiqlangan — 6 ta o'zgaruvchi ham bor (shu jumladan `SUPABASE_SERVICE_ROLE_KEY` va `NEXT_PUBLIC_APP_URL`).
  - **Mos keladi.** Faqat farq — local'da `NEXT_PUBLIC_APP_URL` yo'q, bu muammo emas (u faqat webhook/mini-app URL generatsiya uchun, hali ishlatilmayapti).
- Jonli connection test: **mening sandbox muhitimdan Supabase'ga tarmoq orqali chiqib bo'lmaydi** (tekshirdim — `curl` bilan urinib ko'rdim, bloklangan). Shuning uchun buni sizning tomoningizdan tasdiqlashingiz kerak: admin panel Telegram orqali ochilib, stollar ro'yxati chiqayaptimi? (Agar ha — connection ishlayapti, chunki `/api/state` muvaffaqiyatli Supabase'dan o'qiydi.)

**Xulosa: Connection sog'lom va xavfsiz.**

---

## 2. Mock store'dagi barcha persistent ma'lumotlar (to'liq inventar)

`src/lib/store.tsx` + `src/lib/mock.ts` + `src/lib/types.ts`dan chiqarilgan ro'yxat:

| Domen | Mock manba | Supabase'da bormi? |
|---|---|---|
| Xodimlar (staff, rol, active) | `mockStaff` | ✅ `staff` jadvali |
| Stollar (tables) | `mockTables` | ✅ `club_tables` |
| Mahsulot kategoriyalari | `mockCategories` | ✅ `product_categories` |
| Mahsulotlar | `mockProducts` | ✅ `products` |
| Mijozlar (loyalty, telefon) | `mockCustomers` | ✅ `customers` |
| Sessiyalar (o'yinlar) | `buildActiveSessions` + `buildHistory` | ✅ `game_sessions` |
| Sessiya buyurtmalari (orders) | `GameSession.orders[]` | ✅ `session_orders` (alohida jadval, relational) |
| Bronlar (reservations) | `buildReservations` | ✅ `reservations` |
| To'lov holati/summasi (payment) | `GameSession.paymentStatus/paidAmount/debtAmount` | ✅ `game_sessions` ustunlari |
| Depozit to'lov tasdiqlari | — (mock'da yo'q edi, spec bo'yicha qo'shilgan) | ✅ `deposit_payments` (hali UI/route yo'q — #41 vazifasi) |
| Loyalty (ball) | `Customer.points/totalVisits/totalMinutes` | ✅ `customers` ustunlari, sessiya yopilganda serverda hisoblanadi |
| Sessiya tahrirlash tarixi (audit, o'zgarmas) | `GameSession.editHistory[]` | ✅ `session_edit_log` (faqat INSERT, UPDATE/DELETE yo'q) |
| Umumiy audit log | `buildAudit` | ✅ `audit_log` (faqat INSERT) |
| Sozlamalar (loyalty qoidalari, bron, klub ma'lumoti) | `defaultSettings` | ✅ `club_settings` (bitta qator, singleton) |

**Hammasi uchun Supabase jadvali allaqachon mavjud.** Yangi jadval kerak emas — faqat mijoz tomoni shu jadvallarga ulanishi kerak.

---

## 3–4. Database schema (joriy, ishlab turgan holat)

Quyida **hozir Supabase'da mavjud bo'lgan** to'liq sxema (`supabase/schema.sql` + `migrations/0002`, `0003` qo'llanilgandan keyingi yakuniy holat).

### `club_settings` (singleton, id har doim 1)
| Ustun | Tip | Izoh |
|---|---|---|
| id | int PK, check(id=1) | |
| club_name, address, phone, work_hours, telegram, instagram, info | text | |
| card_payment_enabled | boolean | |
| loyalty | jsonb | `{enabled, minutesPerPoint, pointsForReward, rewardMinutes, minSessionMinutesForReward}` |
| reservation | jsonb | `{enabled, deposit, holdMinutes, onlineTableLimit, paymentTimeoutMinutes}` |
| payment_config | jsonb | `{mode, cardNumber, cardHolder, contactPhone}` — #41 uchun tayyor |
| updated_at | timestamptz | |

### `club_tables`
PK `id` uuid. Ustunlar: `number, name, type(billiard\|tennis), tier(standard\|vip), price_per_hour, online_reservable, enabled, archived, created_at`.

### `product_categories` → `products`
`products.category_id` → FK → `product_categories.id` (ON DELETE CASCADE).

### `customers`
PK `id`. `phone` UNIQUE. `tg_id` UNIQUE (nullable — mijoz hali Telegram orqali bog'lanmagan bo'lishi mumkin).

### `staff`
PK `id`. `tg_id` UNIQUE NOT NULL — bu orqali login qilinadi. `role` check-constraint bilan cheklangan.

### `reservations`
FK: `table_id`→`club_tables`, `customer_id`→`customers` (nullable). Index: `status`, `table_id`.

### `deposit_payments`
FK: `reservation_id`→`reservations` (CASCADE). `reviewed_by`→`staff`. Hali route/UI yo'q (#41).

### `game_sessions` (markaziy jadval)
FK: `table_id`→`club_tables`, `customer_id`→`customers`, `closed_by`→`staff`.
Index: `business_date`, `table_id`, `status`.
`business_date` — doim `Asia/Tashkent` bo'yicha hisoblanadi (`src/lib/permissions.ts:dateKey`), server UTC'da ishlasa ham to'g'ri kun saqlanadi.

### `session_orders`
FK: `session_id`→`game_sessions` (CASCADE), `product_id`→`products` (nullable — mahsulot keyin o'chirilsa ham tarix buzilmasin deb).

### `session_edit_log`, `audit_log`
Faqat INSERT qilinadi kodda (`correctSession`, `correctSessionOrders`, `setSessionNote`, va har bir audit yozuvi) — UPDATE/DELETE hech qayerda chaqirilmaydi. Amaliy jihatdan append-only, lekin **DB darajasida buni majburlovchi trigger yo'q** (pastda #6da taklif bor).

### Relations diagrammasi (matn ko'rinishida)

```
club_settings (singleton)

club_tables ──┬── reservations ──── deposit_payments
              │        │
              │        └── (arrived bo'lsa) game_sessions
              │
              └── game_sessions ──┬── session_orders ── products ── product_categories
                                   └── session_edit_log

customers ── game_sessions (customer_id, nullable)
customers ── reservations (customer_id, nullable)

staff ── game_sessions (closed_by)
staff ── session_edit_log (staff_id)
staff ── audit_log (staff_id)
staff ── deposit_payments (reviewed_by)
```

### Biznes-qoidalar sxemada qanday aks etgan

- Bitta stolga bir vaqtda bitta active session → **hozir faqat ilova darajasida** tekshiriladi (SELECT, keyin INSERT). DB constraint yo'q. → #5da tuzatiladi.
- Session yopilganda `ended_at` saqlanadi, `status='closed'`ga o'tadi → ✅ ishlaydi.
- Payment status/amount alohida ustunlar (`payment_status`, `paid_amount`, `debt_amount`) → ✅.
- Loyalty — faqat sessiya yopilganda, serverda, bir marta hisoblanadi (`/api/sessions/[id]/close`) → ✅. Lekin qayta hisoblanmasligi (idempotency) DB darajasida kafolatlanmagan → #5.
- Audit/edit-log o'zgarmas tarix → kodda ✅, DB trigger bilan mustahkamlash mumkin (ixtiyoriy, #6).

---

## 5. Race condition audit — **TOPILGAN BO'SHLIQLAR**

Sizning tashvishingiz to'g'ri chiqdi — quyidagi 3 joyda hozir faqat "SELECT tekshir, keyin yoz" mantig'i bor, bu **atomik emas**:

### 5.1 — Bitta stolga 2 ta active session
`src/app/api/sessions/route.ts` (POST): avval `select ... where table_id=X and status='active'`, natija bo'sh bo'lsa `insert`. Ikki so'rov millisekundlar farqi bilan kelsa, ikkalasi ham "bo'sh" ko'rib, ikkalasi ham insert qiladi → **bitta stolda 2 ta active session**.

**Yechim**: `game_sessions`ga partial unique index:
```sql
create unique index one_active_session_per_table
  on game_sessions (table_id) where status = 'active';
```
Route'da: pre-check SELECT'ni olib tashlab, to'g'ridan-to'g'ri INSERT qilamiz; Postgres xato kodi `23505` (unique violation) kelsa — "Bu stolda allaqachon aktiv sessiya bor" deb qaytaramiz. Bu chin ma'noda atomik.

### 5.2 — Sessionni 2 marta yopish
`src/app/api/sessions/[id]/close/route.ts`: avval `select status`, `active` bo'lsa keyin `update`. Ikki close so'rovi (masalan ikki xodim bir vaqtda "Yopish" bossa) orasida race bor — ikkalasi ham "active" ko'rib, ikkalasi ham hisob-kitob qilib yozadi (loyalty ball 2 marta qo'shiladi, `closed_by` oxirgisiniki qoladi).

**Yechim**: UPDATE'ning o'ziga shart qo'shamiz:
```ts
.update({...}).eq("id", params.id).eq("status", "active").select("*")
```
Agar natija bo'sh qaytsa (0 qator yangilandi) — demak boshqa so'rov allaqachon yopib ulgurgan, `409 "Sessiya allaqachon yopilgan"` qaytaramiz, loyalty/audit YOZILMAYDI.

### 5.3 — Reservationni 2 marta "arrived" qilish
`src/app/api/reservations/[id]/arrive/route.ts`: xuddi shu naqsh — select status='held', keyin insert+update. Yechim xuddi 5.2dagidek: `update reservations set status='arrived' ... where id=X and status='held'`, 0 qator qaytsa 409.

Bularning barchasi **kichik, xavfsiz, izolyatsiyalangan tuzatishlar** — faqat 3 ta route fayl + 1 ta yangi migration (`0004_race_condition_guards.sql`). UI/dizaynga ta'sir qilmaydi.

---

## 6. RLS — qaror kerak

Hozir: barcha jadvalda RLS yoqilgan, lekin policy yo'q → **default-deny**. Amalda ishlaydi, chunki brauzer hech qachon Supabase'ga to'g'ridan-to'g'ri murojaat qilmaydi (faqat bizning Next.js API route'larimiz orqali, `service_role` bilan, u RLS'ni chetlab o'tadi). Ruxsat mantig'i (`requireStaff(["super_admin"])` va h.k.) route kodida.

Bu **xavfsiz arxitektura** (ko'p production ilovalar shunday ishlaydi), lekin siz so'ragan "kim nima ko'radi/yaratadi/o'zgartiradi/o'chiradi" granular jadvali hozircha faqat kodda, Supabase'ning o'zida emas. Ikkita variant:

**A) Hozirgi holatni saqlash (tavsiya etilgan).** Sabab: yagona yozish yo'li — server — borligi uchun ikkinchi qatlam (RLS policy) asosan ortiqcha murakkablik qo'shadi, xato qilish ehtimoli oshadi (masalan noto'g'ri policy client'ga narsa ko'rsatib qo'yishi mumkin). Route'lardagi `requireStaff` allaqachon to'liq matritsa: super_admin (hammasi) / admin / operator / cashier — har biri uchun `src/lib/permissions.ts` va har bir route'dagi `requireStaff([...])` chaqiruvlarida aniq.

**B) Qo'shimcha RLS policy qatlami qo'shish (defense-in-depth).** Agar kelajakda xato bilan biror joyda client-side Supabase chaqirig'i qo'shilib qolsa (masalan yangi dasturchi bilmasdan), RLS baribir himoya qiladi. Buning uchun har bir jadvalga `auth.jwt()`dan rol o'qiydigan policy yozish kerak — bu Supabase Auth orqali emas, custom JWT orqali ishlaganimiz uchun qo'shimcha sozlash talab qiladi (Supabase Auth hook yoki custom claims).

**Sizdan qaror kerak: A yoki B?** (A tezroq va oddiyroq, B qo'shimcha xavfsizlik qatlami lekin murakkabroq.)

---

## 7. Telegram autentifikatsiya — holat

Sizning eslatmangiz to'g'ri edi umumiy tamoyil sifatida, lekin **bu allaqachon bajarilgan**: demo rol-almashtirgich butunlay olib tashlangan. Hozirgi oqim:

1. Mini App ochilganda `Telegram.WebApp.initData` olinadi.
2. `/api/auth/telegram`da HMAC-SHA256 orqali bot tokeni bilan tekshiriladi (soxtalashtirib bo'lmaydi).
3. `tg_id` bo'yicha `staff` jadvalidan qidiriladi; topilmasa — kirish rad etiladi.
4. Topilsa — imzolangan httpOnly cookie (faqat `staffId`) qo'yiladi.
5. **Har bir keyingi so'rovda** (`requireStaff()`) rol Supabase'dan qayta o'qiladi — cookie'da rol saqlanmaydi. Xodimni o'chirsangiz/rolini pasaytirsangiz, keyingi so'rovdayoq kuchini yo'qotadi.

Mijoz (customer) tomoni uchun bunga o'xshash flow hali yo'q — hozir mijoz shunchaki qo'lda telefon raqami kiritadi (mock). Bu #E/#F bo'limida rejalashtirilgan.

---

## 8. UI/dizayn — tasdiqlangan yondashuv

Admin migratsiyasida qo'llangan naqsh: **hech bir komponent fayli qayta yozilmadi**, faqat `useStore()` → `useAdminStore()` import almashtirildi (bir xil interfeys: `{tables, sessions, ..., startSession(), closeSession(), ...}`). Mijoz tomonini migratsiya qilganda ham xuddi shu naqsh qo'llaniladi — pastda #D/#E'da ko'rsatilgan.

---

## 9. To'liq javob (A–G)

### A) Database schema — yuqorida #3 (allaqachon amalda, faqat #5dagi constraint'lar qo'shiladi)

### B) Relations diagrammasi — yuqorida #3 oxirida

### C) RLS/permission plan — yuqorida #6, sizning qaroringiz kerak

### D) Qaysi fayllar o'zgaradi (mijoz tomoni migratsiyasi uchun, agar tasdiqlasangiz)

Yangi fayllar:
- `src/lib/public-store.tsx` — `admin-store.tsx`ga o'xshash, lekin **login talab qilmaydi**, faqat public ma'lumot (stollar holati, mahsulotlar, sozlamalar) + mijoz identifikatsiyasi telefon orqali.
- `src/app/api/public/state/route.ts` — stollar+sozlamalar+mahsulotlar (auth shart emas, faqat o'qish).
- `src/app/api/public/reservations/route.ts` — mijoz bron qilishi (hozirgi `/api/reservations` staff-only, mijoz uchun alohida, ehtiyotkorroq validatsiya bilan).

O'zgaradigan fayllar (faqat import qatori, komponent tanasi emas):
- `src/app/page.tsx`, `src/app/profile/page.tsx`, `src/app/table/[id]/page.tsx`, `src/components/user/UserShell.tsx`, `src/components/user/UserTableCard.tsx`

### E) Qaysi mock logic o'chadi

`src/lib/store.tsx` (butun mock `StoreProvider`) va `src/lib/mock.ts`dagi generatorlar (`buildActiveSessions`, `buildHistory`, `buildReservations`, `buildAudit`) — mijoz tomoni ham real'ga o'tgandan keyin butunlay kerak bo'lmay qoladi, o'chiriladi.

### F) Yangi API/RPC/server functions kerak

1. `POST /api/sessions` — pre-check SELECT olib tashlanadi, unique constraint + `23505` catch qo'shiladi (#5.1).
2. `POST /api/sessions/[id]/close` — conditional UPDATE (#5.2).
3. `POST /api/reservations/[id]/arrive` — conditional UPDATE (#5.3).
4. `src/app/api/public/*` — mijoz uchun yangi, kamroq huquqli route'lar.
5. (Agar B variant tanlansa) RLS policy fayllari + custom JWT claims sozlamasi.

### G) Migration bosqichlari (tasdiqlagandan keyingi tartib)

1. **Race condition tuzatishlari** (#5) — eng muhim, xavfsizlikka bevosita ta'sir qiladi, kichik va tez.
2. RLS qarori (#6) — A yoki B, sizning javobingizga qarab.
3. Mijoz tomoni migratsiyasi (#D/#E) — public store + route'lar, so'ng 5 ta faylda import almashtirish.
4. To'lov tasdiqlash (#41, `deposit_payments` allaqachon tayyor) — shu bosqichda yoki alohida, sizning ustuvorligingizga qarab.

---

## Sizdan kerak bo'lgan javoblar

1. #5 (race condition tuzatishlari) — boshlashga tasdiqmi? (Tavsiya: ha, darhol.)
2. #6 — RLS uchun A (hozirgidek, oddiy) yoki B (qo'shimcha policy qatlami)?
3. #D/#E (mijoz tomonini ham real qilish) — hozir boshlaymizmi yoki keyinroq?
