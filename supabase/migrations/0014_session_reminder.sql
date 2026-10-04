-- 0014_session_reminder.sql (2026-10)
-- "Bildirishnoma" — admin stol ochilgach qo'lda vaqt belgilaydi (masalan
-- 30 daqiqa yoki 1 soat); shuncha vaqt o'tgach Telegram Audit kanaliga
-- bitta eslatma xabari yuboriladi ("4-stol uchun 1 soat vaqti bo'ldi").
-- Stolni AVTOMATIK yopmaydi — faqat eslatma. reminder_sent_at to'ldirilgan
-- bo'lsa (CAS — bir nechta /api/state so'rovi bir vaqtda tekshirsa ham),
-- ikkinchi marta yuborilmaydi.
alter table game_sessions
  add column if not exists reminder_minutes int,
  add column if not exists reminder_at timestamptz,
  add column if not exists reminder_sent_at timestamptz;
