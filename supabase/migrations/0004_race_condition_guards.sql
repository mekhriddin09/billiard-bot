-- Bitta stolga bir vaqtda faqat BITTA active session bo'lishini DB
-- darajasida majburlaydi. Ilova darajasidagi "SELECT, keyin INSERT"
-- tekshiruvi atomik emas edi (ikki so'rov bir vaqtda kelsa, ikkalasi
-- ham "bo'sh" ko'rib, ikkalasi ham yozishi mumkin edi).
create unique index if not exists one_active_session_per_table
  on game_sessions (table_id) where status = 'active';
