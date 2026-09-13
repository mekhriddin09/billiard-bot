-- ============================================================
-- Boshlang'ich konfiguratsiya (stollar + mahsulotlar).
-- schema.sql'dan KEYIN, bir marta SQL Editor'da ishga tushiring.
-- Narx/nomlarni keyin Admin → Sozlamalar'dan ham o'zgartirish mumkin —
-- bu shunchaki ishga tushish uchun boshlang'ich holat.
-- ============================================================

-- ─── Stollar: 9 billiard (1-tasi VIP) + 2 tennis ────────────
insert into club_tables (number, name, type, tier, price_per_hour, online_reservable, enabled, archived)
select n, '№' || n, 'billiard', case when n = 9 then 'vip' else 'standard' end,
       case when n = 9 then 50000 else 40000 end,
       n <= 3, true, false
from generate_series(1, 9) as n;

insert into club_tables (number, name, type, tier, price_per_hour, online_reservable, enabled, archived)
select n, 'T' || n, 'tennis', 'standard', 30000, false, true, false
from generate_series(1, 2) as n;

-- ─── Mahsulot kategoriyalari ─────────────────────────────────
insert into product_categories (name, emoji, sort_order) values
  ('Ichimliklar', '🥤', 1),
  ('Taomlar', '🍗', 2),
  ('Gazaklar', '🍿', 3);

-- ─── Mahsulotlar ──────────────────────────────────────────────
insert into products (category_id, name, price, emoji, available, active)
select id, 'Coca-Cola', 15000, '🥤', true, true from product_categories where name = 'Ichimliklar'
union all
select id, 'Suv', 5000, '💧', true, true from product_categories where name = 'Ichimliklar'
union all
select id, 'Fanta', 15000, '🍊', true, true from product_categories where name = 'Ichimliklar'
union all
select id, 'Choy', 8000, '🍵', true, true from product_categories where name = 'Ichimliklar'
union all
select id, 'Jigar', 35000, '🍢', true, true from product_categories where name = 'Taomlar'
union all
select id, 'Shashlik', 40000, '🍖', true, true from product_categories where name = 'Taomlar'
union all
select id, 'Lag''mon', 30000, '🍜', true, true from product_categories where name = 'Taomlar'
union all
select id, 'Chipsi', 12000, '🍟', true, true from product_categories where name = 'Gazaklar'
union all
select id, 'Pista', 10000, '🥜', true, true from product_categories where name = 'Gazaklar';

-- ─── Xodimlar (bootstrap) ─────────────────────────────────────
-- Mehriddin — birinchi super_admin sifatida qo'shiladi, chunki bo'sh
-- xodimlar jadvaliga hech kim boshqasini qo'sha olmaydi. Klub egasi
-- ID'sini olganingdan keyin, Mehriddin unga Sozlamalar → Xodimlar'dan
-- "Super qilish" bosadi, keyin o'zini "Admin darajasiga tushirish"
-- bilan pasaytiradi (bir nechta super admin bo'lgani uchun bu xavfsiz).
insert into staff (name, tg_id, tg_username, role, active) values
  ('Mehriddin', '1403306196', 'mehriddin', 'super_admin', true);
