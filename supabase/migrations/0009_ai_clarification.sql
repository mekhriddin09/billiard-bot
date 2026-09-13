-- ============================================================
-- 0009_ai_clarification.sql — AI Admin Agent: ko'p-bosqichli
-- aniqlashtirish konteksti (Faza 6)
--
-- Bu migratsiya HECH QANDAY mavjud funksionallikni o'zgartirmaydi —
-- faqat AI Telegram agentga "2 ta kola" -> AI "qaysi hajmda?" ->
-- "1.5 lik" kabi IKKI (yoki undan ortiq) xabarli tuzatish oqimini
-- qo'llab-quvvatlash uchun yangi, mustaqil jadval qo'shadi.
--
-- Ishlash tamoyili (src/lib/ai/clarification.ts, src/lib/ai/dispatch.ts):
--  1) AI (LLM) so'rovni noaniq deb topsa va tool chaqirmasdan
--     aniqlashtiruvchi savol bersa, javobini "[CLARIFY] " prefiksi
--     bilan boshlaydi (system prompt shunga o'rgatadi).
--  2) dispatch.ts shu prefiksni ko'rib, ASL foydalanuvchi xabarini
--     (LLM javobini emas) shu jadvalga yozadi — chat_id+staff_id
--     bo'yicha BITTA qator (unique constraint, upsert).
--  3) Keyingi xabar kelganda, agar muddati o'tmagan pending yozuv
--     bo'lsa — u ISTE'MOL QILINADI (o'chiriladi) va ikkala xabar
--     birlashtirilib ("asl matn\n(qo'shimcha izoh): yangi matn")
--     LLM'ga YANGI, mustaqil so'rov sifatida yuboriladi.
--  4) 5 daqiqadan keyin muddati tugaydi — eski/unutilgan
--     aniqlashtirishlar keyingi keraksiz xabarga tasodifan
--     yopishtirilib qolmaydi.
--
-- pending_ai_actions (0008-migratsiya, tasdiqlash navbati) bilan
-- ARALASHMAYDI — bu butunlay mustaqil, faqat "LLM oldin nima
-- so'ragan edi" degan savolga javob beradigan yengil mexanizm.
-- ============================================================

create table pending_clarifications (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  staff_id uuid not null references staff(id),
  original_text text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  unique (chat_id, staff_id)
);
create index idx_pending_clarifications_expires on pending_clarifications(expires_at);

alter table pending_clarifications enable row level security;
