-- ============================================================
-- 0012_reservation_requests.sql — "Oldindan bron" TO'LIQ ALMASHTIRISH
-- (2026-08, foydalanuvchi so'rovi): avtomatik depozit/hold bron o'rniga
-- endi mijoz shunchaki "Bog'lanish so'rovi" qoldiradi (telefon raqami +
-- ixtiyoriy izoh) — admin buni ko'rib, mijozga o'zi qo'ng'iroq qiladi va
-- kelishilgandan keyin, agar kerak bo'lsa, MAVJUD xodim vositasi
-- (POST /api/reservations — reservations jadvali, o'zgarishsiz qoladi)
-- orqali stolni qo'lda bron qiladi.
--
-- MUHIM: eski `reservations` jadvali/ish oqimi (held/arrived/expired,
-- xodimning qo'lda bron qilish tugmasi, computeBill'dagi depozit hisobi)
-- BUTUNLAY O'ZGARISHSIZ qoladi — bu FAQAT mijozning o'z-o'ziga xizmat
-- ko'rsatish (auto-hold) yo'lini almashtiradi, xodim vositasini emas.
--
-- Ishlash tamoyili:
--  1) Mijoz Mini App'da bo'sh, online-bron-qilinadigan stol uchun
--     telefon raqami (+ixtiyoriy izoh) qoldiradi — POST /api/public/
--     reservations (o'zgartirilgan, endi HECH QANDAY hold/deposit
--     yaratmaydi) shu yerga bitta "pending" qator yozadi.
--  2) Admin Telegram log kanaliga darhol xabar boradi (bestEffort).
--  3) Admin (Sozlamalar yoki alohida ro'yxat orqali — #193) so'rovni
--     ko'radi, mijozga qo'ng'iroq qiladi, so'ng "contacted" deb
--     belgilaydi (kim, qachon — contacted_by/contacted_at).
-- ============================================================

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

alter table reservation_requests enable row level security;
