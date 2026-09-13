# Bosqich 2 — ishga tushirish qadamlari

Kod tayyor, `tsc`/`build` toza o'tdi. Qolgan hammasi — sizning terminalingizda.

## 1. Supabase — migratsiya

SQL Editor'ga ketma-ket joylang (agar 0004/0005'ni avval ishga tushirmagan
bo'lsangiz, ularni ham joylang):

```
supabase/migrations/0006_bot_debt_reports.sql
```

## 2. Vercel — yangi environment variable'lar

```bash
printf "37f986199dfb6751b5899096664af61f795ad6dc7d3aa95e26faa5fcffc19d46" | npx vercel env add TELEGRAM_WEBHOOK_SECRET production
printf "f0a3c79b56d4badfdb085d64a7fe01e36e1af89d6932bd7bfb9e25dd55d8f3cb" | npx vercel env add CRON_SECRET production
```

## 3. Deploy

```bash
npx vercel --prod
```

`vercel.json`dagi kunlik cron shu deploy bilan avtomatik ro'yxatdan o'tadi.

## 4. Telegram webhook'ni ro'yxatdan o'tkazish

Deploy tugagach, terminalda (faqat BIR MARTA kerak):

```bash
curl -X POST "https://api.telegram.org/bot8983607663:AAFc3VFZWV_ZVgCJNnup9QKwKJaDcC-RccU/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://biliardclub.vercel.app/api/telegram/webhook","secret_token":"37f986199dfb6751b5899096664af61f795ad6dc7d3aa95e26faa5fcffc19d46"}'
```

Muvaffaqiyatli bo'lsa `{"ok":true,"result":true,...}` qaytaradi. Tekshirish:

```bash
curl "https://api.telegram.org/bot8983607663:AAFc3VFZWV_ZVgCJNnup9QKwKJaDcC-RccU/getWebhookInfo"
```

## 5. Log kanalni ulash

1. Telegram'da yangi **yopiq kanal** yarating (masalan "SHO'RCHI BILLIARD — LOG").
2. Botni (@ShurchiBilyardClub_Bot) kanalga **admin** sifatida qo'shing
   ("Post Messages" huquqi yetarli).
3. Kanaldagi istalgan xabarni (yoki botning o'zi yozgan birinchi xabarni)
   botga **shaxsiy chatda forward qiling**. Faqat Super Admin akkountidan
   forward qabul qilinadi.
4. Bot sizga "✅ Kanal ulandi" deb javob beradi. Admin panel → Sozlamalar →
   Telegram'da tasdiqlang.

## 6. Sinov oqimi

1. Botga `/start` yozing → xush kelibsiz xabari + "🎱 Klubni ochish" tugmasi
   chiqishi kerak; telefon yo'q bo'lsa — kontakt so'rash tugmasi ham.
2. Kontaktni yuboring → "✅ Rahmat" javobi.
3. Admin panelda bir stolda sessiya boshlang → log kanalda "🎱 SESSIYA
   OCHILDI" xabari chiqishi kerak.
4. Mahsulot qo'shing → shu xabarga **reply** qilib "🍹 MAHSULOT QO'SHILDI"
   chiqadi.
5. Sessiyani "Qarz" yoki "Qisman" bilan yoping → "🔴 SESSIYA YOPILDI" va
   "⚠️ QARZ QAYD ETILDI" xabarlari, ikkalasi ham thread ichida.
6. Admin panel → **Qarzlar** bo'limida yangi qarz ko'rinishi kerak. Uni
   ochib qisman to'lov kiriting → "💵 QARZ QISMAN TO'LANDI" xabari.
7. Kunlik hisobot/eslatmalarni HOZIR sinash uchun (kunlik cron kutmasdan):

```bash
curl "https://biliardclub.vercel.app/api/cron/daily-tick" \
  -H "Authorization: Bearer f0a3c79b56d4badfdb085d64a7fe01e36e1af89d6932bd7bfb9e25dd55d8f3cb"
```

   Javobda `{"ok":true,"dailyReports":N,"dueReminders":N,"overdueReminders":N}`
   ko'rinadi. Kunlik hisobot faqat **tugagan** (bugundan oldingi) kunlar
   uchun yuboriladi — bugungi kun uchun ertaga chiqadi.

## Eslatma

- `NEXT_PUBLIC_APP_URL` Vercel'da to'g'ri sozlanganiga ishonch hosil qiling
  (bot tugmasi shu manzilni ochadi).
- Agar kanal ulanmagan/yoqilmagan bo'lsa, barcha log funksiyalari jim
  o'tkazib yuboradi — sessiya/qarz operatsiyalari hech qachon to'xtamaydi.
