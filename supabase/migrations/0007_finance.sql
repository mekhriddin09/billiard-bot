-- ============================================================
-- 0007_finance.sql — Moliya (Finance) moduli, 1-bosqich
--
-- Nima qo'shiladi:
--  1) Yangi jadvallar: expense_categories, expenses, inventory_purchases,
--     salary_payments, refunds, cash_reconciliations, debt_corrections.
--  2) Mavjud jadvallarga ALTER: products (inventar), session_orders
--     (tannarx suratga olish), staff (oylik), club_settings (2-Telegram
--     kanal — Super Admin Alert).
--
-- PRINSIPLAR (foydalanuvchi tomonidan qulflangan qoidalar):
--  - Rule 3 (immutability): moliyaviy faktlar hech qachon UPDATE
--    qilinmaydi/o'chirilmaydi. Tuzatish kerak bo'lsa — YANGI qator
--    (reverses_id orqali asl yozuvga bog'langan, teskari ishorali summa
--    bilan) qo'shiladi. Bundan yagona istisno: `telegram_log_message_id` /
--    `telegram_alert_message_id` — bu moliyaviy fakt emas, faqat xabar
--    yuborilgach thread uchun keyin to'ldiriladigan texnik maydon (xuddi
--    mavjud game_sessions/debts jadvallaridagi patternga o'xshash).
--  - Rule 4 (bitta alert): har bir jadvalda `client_request_id text unique`
--    — frontend bitta amal uchun bitta marta yaratilgan idempotency-key
--    yuboradi; DB unique cheklovi qayta yuborilgan so'rovni (page refresh,
--    tarmoq retry) yangi qator sifatida qo'shishga yo'l qo'ymaydi, shuning
--    uchun ikkinchi marta Telegram alert ham yuborilmaydi (STEP2'da API
--    route shu kalit bo'yicha "topilsa — mavjudini qaytar" qiladi).
--  - Xavfsizlik modeli — mavjud jadvallar bilan bir xil: RLS yoqiladi,
--    policy yaratilmaydi (faqat service_role, Next.js server orqali).
-- ============================================================

-- ─── Operatsion xarajat kategoriyalari ───────────────────────
create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text not null default '💸',
  active boolean not null default true,
  sort_order int not null default 0
);

-- ─── Operatsion xarajatlar (ijara, svet, tozalash va h.k.) ───
-- Inventar xaridi va oylik BU YERGA yozilmaydi — ular alohida jadvalda,
-- chunki ularning buxgalteriyadagi tabiati boshqacha (Rule 2 / Rule 1).
create table expenses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references expense_categories(id),
  name text not null,
  amount int not null check (amount <> 0), -- tuzatish yozuvi manfiy bo'lishi mumkin
  payment_method text not null check (payment_method in ('cash', 'card', 'mixed')),
  cash_amount int,
  card_amount int,
  business_date date not null,
  occurred_at timestamptz not null default now(),
  staff_id uuid references staff(id),
  staff_name text not null,
  note text,
  receipt_url text,
  -- Rule 3: tuzatish — yangi qator, asl yozuvga bog'langan, hech narsa
  -- ustidan yozilmaydi.
  reverses_id uuid references expenses(id),
  -- Rule 4: bitta amal = bitta qator = bitta alert.
  client_request_id text unique,
  telegram_log_message_id bigint,
  telegram_alert_message_id bigint,
  created_at timestamptz not null default now()
);
create index idx_expenses_business_date on expenses(business_date);
create index idx_expenses_category on expenses(category_id);

-- ─── Inventar xaridlari (masalan: 100 dona Coca-Cola, 900 000 so'm) ──
-- Xarid paytida bu CASH FLOW'ga ta'sir qiladi, lekin COGS EMAS (Rule 2).
-- COGS faqat mahsulot SOTILGANDA, session_orders.unit_cost_at_sale orqali
-- tan olinadi.
create table inventory_purchases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  qty numeric not null check (qty <> 0), -- tuzatish yozuvi manfiy bo'lishi mumkin
  unit_cost int not null check (unit_cost >= 0),
  total_cost int not null, -- qty*unit_cost, keyin qayta hisoblanmasin deb suratga olinadi
  payment_method text not null check (payment_method in ('cash', 'card', 'mixed')),
  cash_amount int,
  card_amount int,
  supplier text,
  business_date date not null,
  occurred_at timestamptz not null default now(),
  staff_id uuid references staff(id),
  staff_name text not null,
  note text,
  receipt_url text,
  reverses_id uuid references inventory_purchases(id),
  client_request_id text unique,
  telegram_log_message_id bigint,
  telegram_alert_message_id bigint,
  created_at timestamptz not null default now()
);
create index idx_inventory_purchases_business_date on inventory_purchases(business_date);
create index idx_inventory_purchases_product on inventory_purchases(product_id);

-- ─── Oylik to'lovlari ────────────────────────────────────────
-- staff.monthly_salary — necha so'm HISOBLANISHI kerakligi (accrual);
-- bu jadval — haqiqatda QACHON, NECHA SO'M TO'LANGANI (cash-basis fakt).
create table salary_payments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id),
  staff_name text not null, -- suratga olingan (xodim keyin o'chirilsa ham tarix qoladi)
  amount int not null check (amount <> 0),
  payment_method text not null check (payment_method in ('cash', 'card', 'mixed')),
  cash_amount int,
  card_amount int,
  period_month text not null, -- "YYYY-MM" — qaysi oy uchun
  business_date date not null,
  occurred_at timestamptz not null default now(),
  paid_by uuid references staff(id),
  paid_by_name text not null,
  note text,
  reverses_id uuid references salary_payments(id),
  client_request_id text unique,
  telegram_log_message_id bigint,
  telegram_alert_message_id bigint,
  created_at timestamptz not null default now()
);
create index idx_salary_payments_business_date on salary_payments(business_date);
create index idx_salary_payments_staff on salary_payments(staff_id);
create index idx_salary_payments_period on salary_payments(period_month);

-- ─── Qaytarimlar (refund) ────────────────────────────────────
create table refunds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references game_sessions(id),
  debt_id uuid references debts(id),
  customer_name text,
  amount int not null check (amount <> 0),
  reason text not null,
  payment_method text not null check (payment_method in ('cash', 'card', 'mixed')),
  cash_amount int,
  card_amount int,
  business_date date not null,
  occurred_at timestamptz not null default now(),
  staff_id uuid references staff(id),
  staff_name text not null,
  note text,
  reverses_id uuid references refunds(id),
  client_request_id text unique,
  telegram_log_message_id bigint,
  telegram_alert_message_id bigint,
  created_at timestamptz not null default now()
);
create index idx_refunds_business_date on refunds(business_date);
create index idx_refunds_session on refunds(session_id);
create index idx_refunds_debt on refunds(debt_id);

-- ─── Kassa hisob-kitobi (kunlik naqd pul solishtiruvi) ───────
-- Insert-only: bir kunga bir necha marta qayta sanalishi mumkin (masalan
-- xato bo'lsa), eng so'nggisi (counted_at bo'yicha) "amaldagi" hisoblanadi.
-- Eskisi o'chirilmaydi/UPDATE qilinmaydi — Rule 3.
create table cash_reconciliations (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  opening_cash int not null default 0,
  expected_cash int not null, -- finance.ts orqali hisoblangan qiymat, shu paytda suratga olingan
  counted_cash int not null,
  difference int not null,
  counted_by uuid references staff(id),
  counted_by_name text not null,
  counted_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);
create index idx_cash_reconciliations_business_date on cash_reconciliations(business_date);

-- ─── Qarz tuzatishlari tarixi (Rule 3 — debts uchun) ─────────
-- Mavjud /api/debts/[id] PATCH (super_admin, moliyaviy tuzatish) hozircha
-- debts.original_amount'ni UPDATE qilib qo'yadi (eski qiymat faqat
-- audit_log matnida qoladi). Bu jadval shu tuzatishning STRUKTURAVIY,
-- o'chirilmaydigan yozuvini saqlaydi. STEP2'da mos API route shu jadvalga
-- INSERT qilishni ham bajaradigan bo'ladi (mavjud UPDATE xatti-harakati
-- o'zgarmaydi, faqat tarix endi to'liq strukturaviy saqlanadi).
create table debt_corrections (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references debts(id),
  old_original_amount int not null,
  new_original_amount int not null,
  old_remaining_amount int not null,
  new_remaining_amount int not null,
  reason text not null,
  corrected_by uuid references staff(id),
  corrected_by_name text not null,
  corrected_at timestamptz not null default now()
);
create index idx_debt_corrections_debt on debt_corrections(debt_id);

-- ─── ALTER: mavjud jadvallarga yangi maydonlar ───────────────

-- products: ba'zi mahsulotlar uchun inventar/tannarx kuzatuvi (Rule 2).
-- track_inventory=false bo'lgan mahsulotlar (masalan lag'mon, choy) uchun
-- COGS avtomatik hisoblanmaydi — bu qasddan qilingan qaror (retsept/
-- ingredient darajasi yo'q), operatsion xarajat sifatida qo'lda yoziladi.
alter table products add column track_inventory boolean not null default false;
alter table products add column unit_cost int not null default 0; -- og'irlik-o'rtacha joriy tannarx
alter table products add column stock_qty numeric not null default 0;

-- session_orders: sotuv paytidagi tannarx SURATGA OLINADI — mahsulot
-- keyinchalik yangi partiya bilan boshqa narxda kelsa ham, eski
-- hisobotlar o'zgarmay qoladi (Rule 3 printsipi bilan bir xil mantiq).
-- Eski qatorlar va track_inventory=false mahsulotlar uchun NULL qoladi.
alter table session_orders add column unit_cost_at_sale int;

-- staff: oylik maosh miqdori (accrual bazasi — "necha so'm hisoblanishi
-- kerak"; haqiqiy to'lovlar salary_payments jadvalida).
alter table staff add column monthly_salary int not null default 0;

-- debt_payments: business_date qo'shiladi — cash-basis tushum hisob-kitobi
-- (finance.ts) uchun. Eski jadvalda yo'q edi (faqat `at` timestamptz bor
-- edi); MUHIM: cash-basis printsipi bo'yicha pul QACHON YIG'ILGANI muhim,
-- qarz qachon yaratilgani emas — shuning uchun bu business_date qarzning
-- EMAS, TO'LOVNING sanasi. Eski qatorlar uchun NULL qoladi (STEP2'dan
-- keyin yaratiladigan yangi to'lovlar to'ldiradi); finance.ts eski
-- qatorlarda business_date bo'lmasa `at` ustunidan hisoblab oladi.
alter table debt_payments add column business_date date;
create index idx_debt_payments_business_date on debt_payments(business_date);

-- club_settings: 2-Telegram kanal — "Super Admin Alert". Mavjud
-- telegram_log_channel_id/telegram_log_enabled endi kontseptual ravishda
-- "Audit kanal" hisoblanadi va O'ZGARTIRILMAYDI. Bu kanal HOZIRCHA
-- implementatsiya qilinmaydi (foydalanuvchi so'rovi bo'yicha keyinga
-- qoldirilgan) — faqat maydon joyi tayyorlanadi, enabled=false bilan.
alter table club_settings add column super_admin_alert_channel_id text;
alter table club_settings add column super_admin_alert_enabled boolean not null default false;

-- ============================================================
-- RLS — mavjud jadvallar bilan bir xil model: default-deny,
-- faqat service_role (Next.js server) to'liq kirish huquqiga ega.
-- ============================================================
alter table expense_categories enable row level security;
alter table expenses enable row level security;
alter table inventory_purchases enable row level security;
alter table salary_payments enable row level security;
alter table refunds enable row level security;
alter table cash_reconciliations enable row level security;
alter table debt_corrections enable row level security;
