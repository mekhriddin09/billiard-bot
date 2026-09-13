-- ============================================================
-- 0008_ai_agent.sql — AI Admin Agent, A-bosqich (infratuzilma)
--
-- Bu migratsiya HECH QANDAY mavjud funksionallikni o'zgartirmaydi —
-- faqat kelajakdagi AI agent uchun zamin tayyorlaydi:
--  1) audit_log — AI orqali bajarilgan amallarni ajratish uchun
--     `source`/`metadata` ustunlari (ikkalasi ham default bilan, eski
--     qatorlarga va eski INSERT'larga ta'sir qilmaydi).
--  2) pending_ai_actions — Telegram'da AI tasdiqlash oqimi uchun
--     (hozircha HECH QAYERDA ishlatilmaydi — webhook/LLM ulanishi
--     keyingi bosqichda).
-- ============================================================

-- ─── audit_log kengaytmasi ────────────────────────────────────
-- source: amal qayerdan kelgani ("web" — Admin WebApp, "telegram_ai" —
-- AI agent orqali). Default 'web' — mavjud barcha INSERT'lar (parametr
-- bermaydi) avvalgidek ishlayveradi.
alter table audit_log add column source text not null default 'web' check (source in ('web', 'telegram_ai'));
-- metadata: AI chaqiruvida qaysi tool, qanday argumentlar, natija —
-- to'liq iz uchun (Web App yozuvlarida odatda null qoladi).
alter table audit_log add column metadata jsonb;
create index idx_audit_log_source on audit_log(source);

-- ─── AI tasdiqlash navbati ────────────────────────────────────
-- Admin Telegram bot chatida yozgan amal darhol bajarilmaydi (moliyaviy
-- yoki xavfli bo'lsa) — avval shu yerga "pending" qator qo'shiladi,
-- inline tugmali xabar yuboriladi, faqat SHU tugma bosilgandan keyin
-- haqiqiy amal bajariladi (callback_query orqali, kelajakdagi bosqichda).
create table pending_ai_actions (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  staff_id uuid not null references staff(id),
  staff_name text not null,
  tool_name text not null,
  args jsonb not null,
  preview_text text not null,
  status text not null check (status in ('pending', 'confirmed', 'cancelled', 'expired')) default 'pending',
  telegram_message_id bigint,
  result_summary text,
  error_message text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  resolved_at timestamptz
);
create index idx_pending_ai_actions_status on pending_ai_actions(status);
create index idx_pending_ai_actions_chat on pending_ai_actions(chat_id);

alter table pending_ai_actions enable row level security;
