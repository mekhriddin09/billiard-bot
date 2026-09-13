# Bosqich 2 — Telegram Bot UX, Log Channel, Qarz tizimi, Eslatmalar, Kunlik hisobot

Bu hujjat kodlashdan OLDIN tuzilgan reja. Maqsad — yagona, izchil tizim:
sessiya → Supabase haqiqati → Admin panel → Telegram log → qarz (agar kerak
bo'lsa) → eslatma → kunlik hisobot.

## 0. Mavjud holatni tekshirish natijasi

Kod bazasi va sxema ko'rib chiqildi. Muhim xulosalar:

- **Stol/sessiya UX (bo'lim 2) allaqachon talabga mos.** `/api/public/state`
  band stol haqida faqat `🔴 Band` deb ko'rsatadi (`mapPublicSession` —
  customer/phone/orders hech qachon qaytmaydi). Mijoz sessiyani to'g'ridan-to'g'ri
  boshlay olmaydi — faqat bron (`held`) qiladi, sessiyani xodim boshlaydi. Bu
  qism uchun O'ZGARISH KERAK EMAS.
- **Qarz uchun asos allaqachon bor:** `game_sessions` jadvalida
  `payment_status` (`paid`/`partial`/`debt`), `paid_amount`, `debt_amount`
  ustunlari mavjud, sessiya yopilishida to'ldiriladi. Bularni DUBLIKAT
  qilmayman — session yopilgan paytdagi "muzlatilgan" moliyaviy haqiqat
  sifatida qoladi (kunlik tushum hisobot shundan hisoblanadi).
- **Qarzning KEYINGI hayoti (muddat, eslatma, qisman to'lovlar tarixi,
  eslatma yuborilganmi) uchun mos jadval yo'q.** Buni alohida `debts` +
  `debt_payments` jadvallari orqali qo'shaman (pastda).
- **Telegram bot webhook, log channel yuborish, cron hech narsasi hozircha
  yo'q** — `package.json`da faqat `@supabase/supabase-js`, `jose`, Next.js.
  Bot API bilan ishlash uchun qo'shimcha kutubxona SHART EMAS — oddiy
  `fetch("https://api.telegram.org/bot<token>/sendMessage")` yetarli
  (loyihaning "minimal dependency" tamoyiliga mos).
- `TELEGRAM_BOT_TOKEN` va bot username allaqachon `.env.local`da bor —
  qayta so'ralmaydi.

## 1. Muhim arxitektura qarori: ikki alohida moliyaviy qatlam EMAS

Loyihangizning 11-bandidagi tamoyilga ("Supabase — yagona haqiqat, Telegram
faqat bildirishnoma") qat'iy amal qilish uchun:

- `game_sessions.debt_amount / paid_amount / payment_status` — sessiya
  YOPILGAN paytdagi holatni abadiy saqlaydi ("o'sha kuni shuncha qarz
  qolgan edi"). Kunlik hisobotdagi tushum SHU yerdan hisoblanadi — qarz
  keyin to'lansa ham, o'sha kunning tushumi o'zgarmaydi (bu — moliyaviy
  jihatdan to'g'ri, chunki xizmat o'sha kuni ko'rsatilgan).
- Yangi `debts` jadvali — qarzning JONLI holatini (necha so'm qoldi, muddati,
  eslatma bosqichi) kuzatadi. Qarz to'lansa, FAQAT shu yerdagi
  `paid_amount/remaining_amount` o'zgaradi — `game_sessions` tegilmaydi.
- Bu ikkalasi hech qachon bir-biriga zid bo'lmaydi, chunki turli savollarga
  javob beradi: biri "o'sha kuni nima bo'lgan", ikkinchisi "hozir qancha
  qarz bor".

## 2. Database o'zgarishlari (migratsiya loyihasi — hali ishga tushirilmagan)

### 2.1 `game_sessions`ga qo'shimchalar
```sql
-- Aralash to'lov (naqd + karta) qo'llab-quvvatlanadi
alter table game_sessions drop constraint if exists game_sessions_payment_method_check;
alter table game_sessions add constraint game_sessions_payment_method_check
  check (payment_method in ('cash','card','mixed'));
alter table game_sessions add column cash_amount int;
alter table game_sessions add column card_amount int;

-- Telegram log kanalidagi "SESSIYA OCHILDI" xabariga keyingi voqealar
-- (mahsulot, yopilish) shu orqali reply qiladi — thread hosil bo'ladi.
alter table game_sessions add column telegram_log_message_id bigint;
```

### 2.2 Yangi `debts` jadvali
```sql
create table debts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references game_sessions(id),
  customer_id uuid references customers(id),
  customer_name text not null,
  customer_phone text,
  table_id uuid references club_tables(id),
  original_amount int not null,
  paid_amount int not null default 0,
  remaining_amount int not null,
  status text not null check (status in ('open','paid')) default 'open',
  due_date date,
  note text,
  created_by uuid references staff(id),
  created_by_name text not null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  telegram_log_message_id bigint,
  last_reminder_stage text check (last_reminder_stage in ('due_date','overdue','daily')),
  last_reminder_at timestamptz
);
create index idx_debts_status on debts(status);
create index idx_debts_due_date on debts(due_date);
create index idx_debts_customer on debts(customer_id);
```
`session_id unique` — bitta sessiyaga bitta qarz yozuvi (biznes qoidasi:
qarz sessiya yopilganda, `debt_amount > 0` bo'lsa, avtomatik yaratiladi).

### 2.3 Yangi `debt_payments` jadvali (o'zgarmas to'lov tarixi)
```sql
create table debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references debts(id),
  amount int not null,
  method text not null check (method in ('cash','card','mixed')),
  staff_id uuid references staff(id),
  staff_name text not null,
  note text,
  at timestamptz not null default now()
);
create index idx_debt_payments_debt on debt_payments(debt_id);
```
`session_edit_log`ga o'xshab — HECH QACHON o'chirilmaydi/UPDATE qilinmaydi,
faqat INSERT.

### 2.4 `club_settings`ga qo'shimchalar
```sql
alter table club_settings add column telegram_log_channel_id text;
alter table club_settings add column telegram_log_enabled boolean not null default false;
alter table club_settings add column debt_reminder_policy jsonb not null default
  '{"dueDateReminder":true,"overdueReminder":true,"overdueRepeatDays":3,"dailyReminder":false}'::jsonb;
alter table club_settings add column daily_report_enabled boolean not null default true;
alter table club_settings add column daily_report_time text not null default '23:30';
```

### 2.5 Yangi `daily_reports_sent` jadvali (bir kunga bir marta yuborilishini kafolatlaydi)
```sql
create table daily_reports_sent (
  business_date date primary key,
  sent_at timestamptz not null default now(),
  telegram_message_id bigint,
  total_revenue int not null
);
```

## 3. Yangi kod komponentlari (hali yozilmagan — reja)

1. `src/lib/telegram-bot.ts` — `sendMessage`, `sendMessageReply`,
   `setMyCommands` — Bot API'ga oddiy `fetch` orqali. Xatolik bo'lsa
   `throw` QILMAYDI, `{ok:false, error}` qaytaradi — chaqiruvchi kod
   bilan hech qachon asosiy operatsiyani (sessiya yopish, to'lov) to'xtatib
   qo'ymaydi.
2. `src/app/api/telegram/webhook/route.ts` — bitta endpoint, barcha bot
   yangiliklarini qabul qiladi (`/start`, kontakt yuborish, kanalga
   forward qilingan xabar). `X-Telegram-Bot-Api-Secret-Token` header bilan
   tekshiriladi (yangi `TELEGRAM_WEBHOOK_SECRET` — soxta so'rovlardan
   himoya).
3. `src/lib/telegram-log.ts` — har bir voqea uchun tayyor funksiya
   (`logSessionStarted`, `logProductAdded`, `logSessionClosed`,
   `logDebtCreated`, `logDebtPaid`, `logDailyReport`) — sizning aniq
   shablonlaringiz bo'yicha matn quradi, kanalga yuboradi, birinchi
   xabar `message_id`sini tegishli qatorga (`game_sessions`/`debts`)
   yozadi, keyingilari shu ID'ga `reply_to_message_id` bilan javob beradi.
4. Cron endpointlar (`vercel.json` + Vercel Cron):
   - `/api/cron/debt-reminders` — ochiq qarzlarni skanerlaydi, muddat/
     bosqich siyosatiga qarab eslatma yuboradi, `last_reminder_stage/at`ni
     yangilaydi (spam bo'lmasligi uchun).
   - `/api/cron/daily-report` — Toshkent vaqti bo'yicha sozlangan yopilish
     vaqti o'tganini va bugun hali yuborilmaganini tekshiradi
     (`daily_reports_sent`), yuboradi.
   Ikkalasi ham `CRON_SECRET` bilan himoyalanadi (Vercel Cron avtomatik
   yuboradigan `Authorization: Bearer` header solishtiriladi).
5. Sozlamalar API'ga qo'shimcha (mavjud `settings/route.ts` naqshiga mos,
   super_admin only): log kanal ID, eslatma siyosati, hisobot vaqti.

## 4. Ruxsatlar (sizning 10-bandingiz asosida, aniqlashtirilgan talqin)

| Amal | Kim qila oladi |
|---|---|
| Qarz yaratish (sessiya yopilganda avtomatik) | Tizim, har qanday xodim yopgan sessiyadan |
| Qarz to'lovini qayd etish (paid_amount oshiradi) | Har qanday xodim (`requireStaff()`, misolingizdagi "Jasur" kabi) |
| Izoh/muddat qo'shish-o'zgartirish | Har qanday xodim |
| Qarz yozuvini TUZATISH/bekor qilish (summani orqaga o'zgartirish, o'chirish) | Faqat Super Admin |
| Log kanalni ulash/o'zgartirish | Faqat Super Admin |
| Eslatma siyosatini sozlash | Faqat Super Admin |
| Yopilgan sessiyaning asl summasini tuzatish | Faqat Super Admin (mavjud `correctSession` — o'zgarmaydi) |

Bu — sizning matningizdagi "Admins can: record payments" va "Super Admin:
change debt records after session closed"ni ziddiyatsiz birlashtiruvchi
talqin: **to'lov qayd etish — oddiy operatsion amal (Admin), lekin
yozuvni orqaga tuzatish/bekor qilish — moliyaviy TUZATISH (Super Admin)**,
xuddi sessiya bilan bo'lgani kabi.

## 5. Amalga oshirish tartibi (sizning tartibingizga mos, aniqlashtirilgan)

1. **Bot fundamenti** — webhook, `/start`, kontakt so'rash oqimi. Mini
   App/stol UX'ga tegilmaydi (allaqachon mos).
2. **Log kanal ulash** — sxema + Sozlamalar bo'limi + test xabar yuborish.
3. **Sessiya voqealari logi** — OCHILDI/MAHSULOT/YOPILDI, thread bilan.
4. **Qarz modeli** — `debts`/`debt_payments`, API, admin panelda "Qarzlar"
   bo'limi (yangi, lekin mavjud dizayn tiliga mos — qayta dizayn emas).
5. **Qarz eslatmalari** — cron + siyosat sozlamalari.
6. **Kunlik hisobot** — real Supabase agregatsiyasi + cron.
7. **Oxiridan-oxirigacha test.**

## 6. Qarorlar (tasdiqlangan)

1. **Vercel tarifi: Hobby.** Bu shuni anglatadi: cron kuniga FAQAT 1 marta
   ishga tushirilishi mumkin, va aniq daqiqasi kafolatlanmaydi (Vercel
   soat ichida biroz siljitishi mumkin). Shuning uchun:
   - `vercel.json`da BITTA kunlik cron bo'ladi (masalan, Toshkent bo'yicha
     taxminan yarim tundan keyin — `0 19 * * *` UTC = 00:00 Toshkent).
   - Bu cron har safar "tugagan biznes kuni" uchun hisobot yuboradi (ya'ni
     kecha yopilgan kun), `daily_reports_sent` orqali bir martalik
     yuborilishi kafolatlanadi.
   - Sozlamalardagi `daily_report_time` (masalan "23:30") — HOZIRCHA
     faqat administrator uchun ma'lumot/niyat sifatida saqlanadi;
     Hobby tarifda uni daqiqama-daqiqa ushlab bo'lmaydi. Pro'ga
     o'tilsa, keyin real vaqtli tekshiruvga (har 15-30 daqiqada tick)
     osongina kuchaytiriladi — sxema o'zgarmaydi, faqat cron chastotasi.
   - Qarz eslatmalari ham SHU BITTA kunlik cron ichida tekshiriladi
     (alohida cron shart emas — kuniga bir marta barcha ochiq qarzlarni
     skanerlash yetarli, chunki muddat/necha kun o'tgani kunlik
     granulyatsiyada baribir o'zgarmaydi).
2. **Log kanal ulash: xabarni botga forward qilish.** Super Admin
   kanaldagi istalgan xabarni botga shaxsiy chatda forward qiladi →
   webhook `message.forward_from_chat` orqali `chat_id`ni aniqlaydi →
   Sozlamalarda "aniqlangan kanal" sifatida ko'rsatiladi → Super Admin
   tasdiqlagach saqlanadi.
3. **Qarz ruxsati: hujjatdagi 4-bo'lim bo'yicha.** To'lov qayd etish —
   har qanday xodim; summani orqaga tuzatish/o'chirish — faqat Super
   Admin.
