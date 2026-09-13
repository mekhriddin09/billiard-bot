-- ============================================================
-- Bosqich 2: Telegram bot UX, log kanal, qarz tizimi, eslatmalar,
-- kunlik hisobot. Reja: docs/PHASE2_TELEGRAM_DEBT_PLAN.md
-- ============================================================

-- ─── game_sessions: aralash to'lov + Telegram thread anchor ───
alter table game_sessions drop constraint if exists game_sessions_payment_method_check;
alter table game_sessions add constraint game_sessions_payment_method_check
  check (payment_method in ('cash', 'card', 'mixed'));
alter table game_sessions add column if not exists cash_amount int;
alter table game_sessions add column if not exists card_amount int;
-- "SESSIYA OCHILDI" log xabarining message_id'si — keyingi voqealar
-- (mahsulot, yopilish) shunga reply_to_message_id bilan javob beradi.
alter table game_sessions add column if not exists telegram_log_message_id bigint;

-- ─── Qarzning jonli holati (sessiyadan alohida — 1-bo'limga qarang) ───
create table if not exists debts (
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
create index if not exists idx_debts_status on debts(status);
create index if not exists idx_debts_due_date on debts(due_date);
create index if not exists idx_debts_customer on debts(customer_id);
alter table debts enable row level security;

-- ─── Qarz to'lovlari tarixi — HECH QACHON o'chirilmaydi/UPDATE qilinmaydi ───
create table if not exists debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references debts(id),
  amount int not null,
  method text not null check (method in ('cash', 'card', 'mixed')),
  staff_id uuid references staff(id),
  staff_name text not null,
  note text,
  at timestamptz not null default now()
);
create index if not exists idx_debt_payments_debt on debt_payments(debt_id);
alter table debt_payments enable row level security;

-- ─── club_settings: Telegram log kanal, eslatma siyosati, kunlik hisobot ───
alter table club_settings add column if not exists telegram_log_channel_id text;
alter table club_settings add column if not exists telegram_log_enabled boolean not null default false;
alter table club_settings add column if not exists debt_reminder_policy jsonb not null default
  '{"dueDateReminder":true,"overdueReminder":true,"overdueRepeatDays":3,"dailyReminder":false}'::jsonb;
alter table club_settings add column if not exists daily_report_enabled boolean not null default true;
alter table club_settings add column if not exists daily_report_time text not null default '23:30';

-- ─── Kunlik hisobot bir kunga bir marta yuborilishini kafolatlaydi ───
create table if not exists daily_reports_sent (
  business_date date primary key,
  sent_at timestamptz not null default now(),
  telegram_message_id bigint,
  total_revenue int not null
);
alter table daily_reports_sent enable row level security;
