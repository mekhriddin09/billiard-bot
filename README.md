# 🎱 Sho'rchi Billiard Club

Premium billiard klub boshqaruv tizimi — Telegram Mini App (mijoz) + Admin WebApp.

## Ishga tushirish

```bash
npm install
npm run dev
```

Keyin brauzerda:

| Manzil | Nima |
|---|---|
| `http://localhost:3000` | 👤 Mijoz Mini App (Klub / Profil) |
| `http://localhost:3000/admin` | 🎱 Admin — stollar boshqaruvi |
| `http://localhost:3000/admin/reports` | 📊 Hisobotlar |
| `http://localhost:3000/admin/settings` | ⚙️ Sozlamalar (Super Admin) |
| `http://localhost:3000/table/4` | 📷 QR sahifa (stol №4 ommaviy ma'lumoti) |

## Hozirgi bosqich (Phase 1)

- ✅ To'liq dizayn sistema (dark luxury, felt kartalar, liquid glass, Framer Motion)
- ✅ Admin: dinamik stol grid, real-time timer, o'yin boshlash/tugatish, zakaz, hisob, bron
- ✅ Loyalty: avtomatik ball (1 soat = 1 ball, 10 ball = 1 bepul soat, min 2 soat)
- ✅ Hisobotlar: filtrlar, stol/vaqt analitika, CSV export
- ✅ Sozlamalar: stollar (qo'shish/arxivlash), mahsulotlar, loyalty, bron, klub, xodimlar, audit
- ✅ User Mini App: stollar holati, "Hozir boraman" (depozit bron), "Bo'shaganda ayt", profil
- ✅ QR route — faqat ommaviy ma'lumot (mijoz shaxsi hech qachon ko'rinmaydi)
- 🔶 Ma'lumotlar hozircha **mock** (`src/lib/mock.ts`) — brauzer xotirasida

## Keyingi bosqichlar

1. **Supabase** — `src/lib/store.tsx` dagi action'larni Supabase so'rovlariga almashtirish (tiplar `src/lib/types.ts` da tayyor, RLS bilan)
2. **Telegram bot** — BotFather'dan token olish, telefon so'rash (`request_contact`), Mini App tugmasi
3. **Real-time** — Supabase Realtime kanallari orqali stol statuslari
4. **Rol-tizim** — Telegram ID orqali xodim autentifikatsiyasi

## Struktura

```
src/
  app/            sahifalar (/, /profile, /table/[id], /admin/*)
  components/     admin/ ui/ user/ komponentlar
  lib/
    types.ts      barcha domain tiplar (hech narsa hardcode emas)
    mock.ts       demo ma'lumotlar + default sozlamalar
    store.tsx     holat + barcha action'lar (Supabase'ga tayyor)
    calc.ts       narx / hisob / loyalty hisoblash
    format.ts     pul, vaqt, telefon formatlash
```
