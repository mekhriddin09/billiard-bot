-- session_orders: bitta sessiyada bitta mahsulot uchun FAQAT BITTA qator
-- bo'lishini DB darajasida majburlaydi (0004_race_condition_guards.sql'dagi
-- "one_active_session_per_table" bilan bir xil uslub).
--
-- Sabab: addOrderCore ilgari "SELECT (mavjud qatorni top), keyin
-- INSERT/UPDATE" ketma-ketligi bilan ishlar edi — bu atomik emas edi.
-- "+/-" tugmasi bir necha marta TEZ ketma-ket bosilganda (masalan 3 marta
-- "+1"), bir nechta so'rov deyarli bir vaqtda serverga yetib borib:
--   (a) bir-birining "eski" qty o'qishiga tayanib yozgani uchun natijani
--       yo'qotib qo'yishi ("lost update" — masalan 3 marta bosilgan
--       bo'lsa ham DB'da faqat 1 bo'lib qolishi), YOKI
--   (b) ikkalasi ham "mavjud qator yo'q" deb ko'rib, bitta mahsulot uchun
--       IKKITA alohida qator yaratishi
-- mumkin edi (2026-08, foydalanuvchi xabari: "Cola +ni 3 marta bossam
-- keyin o'zidan 1, 2, 3 bo'lib yoki 0 bo'lib qolyapti").
--
-- Ilova kodi (src/lib/services/sessions.ts — addOrderCore) endi shu
-- UNIQUE indeksga tayanib compare-and-swap + qayta-urinish bilan ishlaydi:
-- yozish faqat o'qilgan eski qiymat hali ham amal qilsa muvaffaqiyatli
-- bo'ladi, aks holda qayta o'qib qayta urinadi; insert paytida indeks
-- to'qnashuvi (23505) bo'lsa — bu boshqa so'rov ulgurgani degani, keyingi
-- urinishda "update" sifatida davom etadi.

-- 1) Agar shu bugungacha (yuqoridagi bug tufayli) allaqachon duplikat
--    qatorlar yaratilgan bo'lsa — ularni xavfsiz birlashtiramiz
--    (miqdorlarni qo'shib, eng birinchi qatorda saqlab qolamiz), aks
--    holda quyidagi UNIQUE indeks yaratilmay xatolik beradi.
-- Eslatma: Postgres'da uuid uchun standart min()/max() agregat funksiyasi
-- YO'Q — shuning uchun "eng birinchi qator"ni tanlashda id'ni text'ga
-- cast qilib min() olamiz (faqat tanlov uchun, real qiymat sifatida
-- ishlatilmaydi — pastda qayta uuid'ga cast qilinadi).
with dupes as (
  select session_id, product_id, min(id::text)::uuid as keep_id, sum(qty) as total_qty
  from session_orders
  where product_id is not null
  group by session_id, product_id
  having count(*) > 1
)
update session_orders so
set qty = dupes.total_qty
from dupes
where so.id = dupes.keep_id;

with dupes as (
  select session_id, product_id, min(id::text)::uuid as keep_id
  from session_orders
  where product_id is not null
  group by session_id, product_id
  having count(*) > 1
)
delete from session_orders so
using dupes
where so.session_id = dupes.session_id
  and so.product_id = dupes.product_id
  and so.id <> dupes.keep_id;

-- 2) Endi xavfsiz — bitta sessiya + bitta mahsulot uchun bitta qatorni
--    DB darajasida majburlaymiz (product_id NULL bo'lgan qatorlar bundan
--    mustasno — Postgres qoidasiga ko'ra NULL'lar bir-biriga teng emas
--    deb hisoblanadi, shuning uchun WHERE bilan aniq cheklaymiz).
create unique index if not exists one_row_per_session_product
  on session_orders (session_id, product_id) where product_id is not null;
