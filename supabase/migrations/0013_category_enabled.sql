-- 0013_category_enabled.sql (2026-09)
-- "Kategoriya yashirish" — Mini POS mahsulot qo'shish panelidagi kategoriya
-- tab'laridan keraksiz/bo'sh kategoriyalarni (masalan hali mahsuloti
-- qo'shilmagan "Taomlar") yashirish uchun, o'chirmasdan.
alter table product_categories
  add column if not exists enabled boolean not null default true;
