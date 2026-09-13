-- ============================================================
-- 0011_table_watchers.sql — "Bo'shaganda xabar ber" backend
-- (2026-08, foydalanuvchi so'rovi: mijoz band stolda shu tugmani
-- bossa, stol sessiyasi YOPILGANDA unga Telegram orqali xabar
-- yuborilishi kerak — hozirgacha bu tugma faqat local UI holati
-- edi, hech qanday backend yo'q edi).
--
-- Ishlash tamoyili:
--  1) Mijoz Mini App'da band stol uchun "🔔 Bo'shaganda xabar ber"
--     tugmasini bossa — POST /api/public/table-watch shu yerga
--     bitta qator yozadi (customer_id + stol + tg_id, notified_at
--     hali NULL — "faol kuzatuv").
--  2) Sessiya YOPILGANDA (closeSessionCore, src/lib/services/
--     sessions.ts) shu stol uchun notified_at IS NULL bo'lgan barcha
--     qatorlarga Telegram DM yuboriladi (best-effort, asosiy
--     operatsiyani sekinlashtirmaydi/to'xtatmaydi — Telegram, oldingi
--     barcha bildirishnomalar kabi, faqat qatlam), so'ng notified_at
--     belgilanadi (qayta xabar yuborilmasligi uchun).
--  3) Mijoz tugmani qayta bossa (bekor qilmoqchi bo'lsa) —
--     notified_at IS NULL bo'lgan qatori o'chiriladi.
--
-- Bitta mijoz bitta stol uchun faqat BITTA faol (notified_at IS NULL)
-- kuzatuv yozuviga ega bo'lishi mumkin (unique partial index) —
-- tugmani bir necha marta bossa ham dublikat yaratilmaydi.
-- ============================================================

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

alter table table_watchers enable row level security;
