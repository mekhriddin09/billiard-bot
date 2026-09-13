-- game_sessions.closed_by (uuid) staff jadvalidan olib ko'rsatish o'rniga,
-- yopgan xodim ISMINI ham denormalizatsiya qilib saqlaymiz (session_edit_log
-- va audit_log'dagi staff_name naqshiga mos) — hisobot/tarix so'rovlarida
-- staff jadvaliga JOIN qilmasdan to'g'ridan-to'g'ri ko'rsatish uchun.
alter table game_sessions add column if not exists closed_by_name text;
