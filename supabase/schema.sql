-- ============================================================
-- SHO'RCHI BILLIARD CLUB — Supabase production sxemasi (v1)
-- Bu faylni Supabase Dashboard → SQL Editor'ga joylab, "Run" bosing.
--
-- XAVFSIZLIK MODELI:
-- Barcha yozish (va deyarli barcha o'qish) operatsiyalari FAQAT
-- Next.js server tomonidan, service_role kaliti orqali amalga oshiriladi.
-- RLS yoqilgan, lekin policy yaratilmagan => anon/authenticated
-- kalit bilan hech kim to'g'ridan-to'g'ri o'qiy/yoza olmaydi.
-- Rol tekshiruvi (kim nima qila oladi) Next.js API route'larida,
-- src/lib/permissions.ts mantig'i asosida amalga oshiriladi.
-- ============================================================

create extension if not exists pgcrypto;

-- ─── Sozlamalar (bitta qator — singleton) ───────────────────
create table club_settings (
  id int primary key default 1 check (id = 1),
  club_name text not null default '',
  address text not null default '',
  phone text not null default '',
  work_hours text not null default '',
  telegram text not null default '',
  instagram text not null default '',
  info text not null default '',
  card_payment_enabled boolean not null default true,
  loyalty jsonb not null default '{}'::jsonb,
  reservation jsonb not null default '{}'::jsonb,
  -- payment_config.mode: "contact_only" | "card_screenshot" | "gateway"
  payment_config jsonb not null default
    '{"mode":"card_screenshot","cardNumber":"","cardHolder":"","contactPhone":""}'::jsonb,
  telegram_log_channel_id text,
  telegram_log_enabled boolean not null default false,
  debt_reminder_policy jsonb not null default
    '{"dueDateReminder":true,"overdueReminder":true,"overdueRepeatDays":3,"dailyReminder":false}'::jsonb,
  daily_report_enabled boolean not null default true,
  daily_report_time text not null default '23:30',
  updated_at timestamptz not null default now()
);
insert into club_settings (id) values (1) on conflict do nothing;

-- ─── Stollar ──────────────────────────────────────────────────
create table club_tables (
  id uuid primary key default gen_random_uuid(),
  number int not null,
  name text not null,
  type text not null check (type in ('billiard','tennis')),
  tier text not null check (tier in ('standard','vip')),
  price_per_hour int not null,
  online_reservable boolean not null default false,
  enabled boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─── Mahsulot kategoriyalari va mahsulotlar ─────────────────
create table product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text not null default '🛒',
  sort_order int not null default 0,
  -- Mini POS'dagi kategoriya tab'laridan yashirish uchun (0013-migratsiya,
  -- 2026-09) — kategoriya/mahsulotlari o'chirilmaydi, faqat tezkor
  -- tanlovda ko'rinmay turadi (Sozlamalar'da har doim ko'rinadi).
  enabled boolean not null default true
);

create table products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references product_categories(id) on delete cascade,
  name text not null,
  price int not null,
  emoji text not null default '🛒',
  available boolean not null default true,
  active boolean not null default true
);

-- ─── Mijozlar ────────────────────────────────────────────────
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  -- Telegram orqali avtomatik yaratilganda telefon hali yo'q bo'lishi mumkin.
  phone text,
  tg_id text unique,
  tg_username text,
  points int not null default 0,
  total_visits int not null default 0,
  total_minutes int not null default 0,
  created_at timestamptz not null default now()
);
create unique index customers_phone_unique on customers (phone) where phone is not null;

-- ─── Xodimlar ────────────────────────────────────────────────
create table staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tg_id text unique not null,
  tg_username text not null default '',
  role text not null check (role in ('super_admin','admin','operator','cashier')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
-- Eslatma: bir vaqtda bir nechta super_admin bo'lishi mumkin (klub egasi +
-- hamkorlar). Kamida bittasi doim qolishi ilova darajasida (revokeSuperAdmin /
-- API route) ta'minlanadi, DB darajasida cheklov yo'q.

-- ─── Bronlar ─────────────────────────────────────────────────
create table reservations (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references club_tables(id),
  customer_id uuid references customers(id),
  customer_phone text,
  deposit int not null default 0,
  created_at timestamptz not null default now(),
  hold_until timestamptz not null,
  status text not null check (status in ('held','arrived','expired','cancelled')) default 'held'
);
create index idx_reservations_status on reservations(status);
create index idx_reservations_table on reservations(table_id);

-- ─── "Bo'shaganda xabar ber" kuzatuvlari (0011-migratsiya, 2026-08) ──
-- Mijoz band stolni kuzatishni so'raydi — sessiya YOPILGANDA
-- (closeSessionCore) notified_at IS NULL bo'lgan qatorlarga Telegram DM
-- yuboriladi, so'ng notified_at belgilanadi. Bitta mijoz+stol uchun bir
-- vaqtda faqat BITTA faol (notified_at IS NULL) qator bo'lishi mumkin.
create table table_watchers (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references club_tables(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  tg_id text not null,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);
create unique index one_active_watch_per_customer_table
  on table_watchers (table_id, customer_id) where notified_at is null;
create index idx_table_watchers_table_active
  on table_watchers (table_id) where notified_at is null;

-- ─── "Bog'lanish so'rovi" (0012-migratsiya, 2026-08) ─────────
-- Mijozning "oldindan bron" o'rniga TO'LIQ ALMASHTIRGAN, sodda oqimi:
-- avtomatik hold/deposit YO'Q — mijoz telefon raqamini qoldiradi, admin
-- o'zi qo'ng'iroq qiladi. Eski `reservations` jadvali (yuqorida) —
-- xodimning QO'LDA bron qilish vositasi sifatida O'ZGARISHSIZ qoladi.
create table reservation_requests (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references club_tables(id) on delete cascade,
  customer_id uuid references customers(id),
  customer_phone text not null,
  note text,
  status text not null check (status in ('pending','contacted','cancelled')) default 'pending',
  created_at timestamptz not null default now(),
  contacted_at timestamptz,
  contacted_by uuid references staff(id),
  contacted_by_name text
);
create index idx_reservation_requests_status on reservation_requests(status);
create index idx_reservation_requests_table on reservation_requests(table_id);

-- ─── Depozit to'lov tasdiqlari ───────────────────────────────
-- Click/Payme/Paynet ulanguncha: karta+screenshot yoki faqat aloqa.
-- Keyinchalik gateway_provider/gateway_txn_id orqali real API natijasi yoziladi.
create table deposit_payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  method text not null check (method in ('card_screenshot', 'contact_admin', 'gateway')),
  amount int not null,
  screenshot_url text,
  gateway_provider text check (gateway_provider in ('click', 'payme', 'paynet')),
  gateway_txn_id text,
  status text not null check (status in ('pending', 'approved', 'rejected')) default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references staff(id),
  reviewed_at timestamptz,
  note text
);
create index idx_deposit_payments_status on deposit_payments(status);

-- ─── O'yin sessiyalari ───────────────────────────────────────
create table game_sessions (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references club_tables(id),
  started_at timestamptz not null,
  ended_at timestamptz,
  business_date date not null,
  customer_id uuid references customers(id),
  customer_phone text,
  adjust_minutes int not null default 0,
  status text not null check (status in ('active', 'closed')) default 'active',
  paid boolean not null default false,
  payment_method text check (payment_method in ('cash', 'card', 'mixed')),
  cash_amount int,
  card_amount int,
  telegram_log_message_id bigint,
  final_table_cost int,
  final_total int,
  points_earned int,
  reward_minutes_used int,
  payment_status text check (payment_status in ('paid', 'partial', 'debt')),
  paid_amount int,
  debt_amount int,
  note text,
  note_by text,
  note_at timestamptz,
  closed_by uuid references staff(id),
  closed_by_name text,
  closed_by_role text,
  created_at timestamptz not null default now()
);
create index idx_sessions_business_date on game_sessions(business_date);
create index idx_sessions_table on game_sessions(table_id);
create index idx_sessions_status on game_sessions(status);
-- Bitta stolga bir vaqtda faqat BITTA active session — DB darajasida majburiy.
create unique index one_active_session_per_table
  on game_sessions (table_id) where status = 'active';

-- ─── Qarzning jonli holati (sessiyadan alohida — PHASE2_TELEGRAM_DEBT_PLAN.md) ─
create table debts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references game_sessions(id),
  customer_id uuid references customers(id),
  customer_name text not null,
  customer_phone text,
  table_id uuid references club_tables(id),
  original_amount int not null,
  paid_amount int not null default 0,
  remaining_amount int not null,
  status text not null check (status in ('open', 'paid')) default 'open',
  due_date date,
  note text,
  created_by uuid references staff(id),
  created_by_name text not null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  telegram_log_message_id bigint,
  last_reminder_stage text check (last_reminder_stage in ('due_date', 'overdue', 'daily')),
  last_reminder_at timestamptz
);
create index idx_debts_status on debts(status);
create index idx_debts_due_date on debts(due_date);
create index idx_debts_customer on debts(customer_id);

-- ─── Qarz to'lovlari tarixi — HECH QACHON o'chirilmaydi/UPDATE qilinmaydi ─
create table debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references debts(id),
  amount int not null,
  method text not null check (method in ('cash', 'card', 'mixed')),
  staff_id uuid references staff(id),
  staff_name text not null,
  note text,
  at timestamptz not null default now()
);
create index idx_debt_payments_debt on debt_payments(debt_id);

-- ─── Kunlik hisobot bir kunga bir marta yuborilishini kafolatlaydi ─
create table daily_reports_sent (
  business_date date primary key,
  sent_at timestamptz not null default now(),
  telegram_message_id bigint,
  total_revenue int not null
);

-- ─── Sessiya buyurtma qatorlari (mahsulotlar) ────────────────
create table session_orders (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references game_sessions(id) on delete cascade,
  product_id uuid references products(id),
  name text not null,
  emoji text not null default '🛒',
  price int not null,
  qty int not null check (qty > 0)
);
create index idx_session_orders_session on session_orders(session_id);
-- Bitta sessiyada bitta mahsulot uchun faqat BITTA qator — DB darajasida
-- majburiy (0010_session_orders_race_guard.sql; "+/-" tugmasi tez-tez
-- bosilganda lost-update/duplikat qator bo'lmasligi uchun).
create unique index one_row_per_session_product
  on session_orders (session_id, product_id) where product_id is not null;

-- ─── Sessiya tahrirlash tarixi — HECH QACHON o'chirilmaydi/UPDATE qilinmaydi ─
create table session_edit_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references game_sessions(id),
  at timestamptz not null default now(),
  staff_id uuid references staff(id),
  staff_name text not null,
  role text not null,
  field text not null,
  old_value text not null,
  new_value text not null,
  reason text
);
create index idx_session_edit_log_session on session_edit_log(session_id);

-- ─── Umumiy audit log — HECH QACHON o'chirilmaydi/UPDATE qilinmaydi ─
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  staff_id uuid references staff(id),
  staff_name text not null,
  role text not null,
  action text not null
);
create index idx_audit_log_at on audit_log(at desc);

-- ============================================================
-- RLS — DEFAULT DENY. Policy qo'shilmagan, ya'ni anon/authenticated
-- kalit bilan hech kim hech narsa qila olmaydi. Faqat service_role
-- (Next.js server, hech qachon brauzerga chiqmaydi) RLS'ni chetlab
-- o'tadi va to'liq kirish huquqiga ega.
-- ============================================================
alter table club_settings enable row level security;
alter table club_tables enable row level security;
alter table product_categories enable row level security;
alter table products enable row level security;
alter table customers enable row level security;
alter table staff enable row level security;
alter table reservations enable row level security;
alter table table_watchers enable row level security;
alter table reservation_requests enable row level security;
alter table deposit_payments enable row level security;
alter table game_sessions enable row level security;
alter table session_orders enable row level security;
alter table session_edit_log enable row level security;
alter table audit_log enable row level security;
alter table debts enable row level security;
alter table debt_payments enable row level security;
alter table daily_reports_sent enable row level security;
