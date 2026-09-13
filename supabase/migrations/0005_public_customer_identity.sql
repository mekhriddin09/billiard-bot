-- Mijoz tomoni endi Telegram orqali (tg_id bo'yicha) avtomatik aniqlanadi —
-- ro'yxatdan o'tishda telefon raqami talab qilinmaydi (keyinroq profil orqali
-- qo'shilishi mumkin). Shuning uchun `phone` majburiy bo'lishi kerak emas.
alter table customers alter column phone drop not null;
alter table customers drop constraint if exists customers_phone_key;
-- Bir nechta mijoz telefonsiz (null) bo'lishi mumkin — bu yerda unique
-- indeks faqat telefon KIRITILGAN qatorlar uchun ishlaydi.
create unique index if not exists customers_phone_unique
  on customers (phone) where phone is not null;
