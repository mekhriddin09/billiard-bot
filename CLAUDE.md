# Sho'rchi Billiard Club — CLAUDE.md

Bu fayl loyihaning **konstitutsiyasi**. Har qanday o'zgarish (ayniqsa AI Admin Agent bilan bog'liq) shu qoidalarga zid bo'lmasligi kerak. Kod yozishdan oldin shu faylni va tegishli `.claude/skills/*/SKILL.md`ni o'qing.

## 1. PROJECT IDENTITY

Bu — **Sho'rchi Billiard Club**ning ichki boshqaruv tizimi:

- **Telegram Mini App / Web App** — mijozlar va admin uchun (Next.js 14 App Router, `src/app`).
- **Admin Web App** — xodimlar stollarni, mahsulotlarni, moliyani boshqaradi (`/admin/*`).
- **Telegram AI Admin Agent** — xodimlar Telegram botga tabiiy tilda yozib, klubni boshqaradi (`src/lib/ai/*`, webhook: `src/app/api/telegram/webhook/route.ts`).
- **Supabase** — yagona ma'lumotlar bazasi (Postgres), RLS **default-deny** (har bir jadvalda yoqilgan, siyosat yo'q — faqat server-side `service_role` kaliti orqali kirish mumkin, brauzerga hech qachon chiqarilmaydi).
- **Next.js backend** — barcha biznes-mantiq server-side (`src/lib/services/*`, `src/lib/finance.ts`, `src/lib/calc.ts`).

**Yagona klub** (single-tenant) — `club_id`/`tenant_id` kabi ustunlar yo'q, kerak ham emas. Agar kelajakda ko'p klublik bo'lishi kerak bo'lsa, bu alohida, katta migratsiya bo'lib qoladi — hozircha bunga tayyorgarlik ko'rish shart emas.

AI faqat shu loyiha/klubning avtorizatsiya qilingan ma'lumotlari va tool'lari doirasida ishlaydi. AI umumiy ChatGPT emas — agar savol loyiha ma'lumotlariga aloqador bo'lmasa, AI buni qisqa aytadi yoki klub boshqaruvi doirasida yordam bera olishini tushuntiradi (§9, §10 pastda).

## 2. AI ASOSIY QOIDALARI (qat'iy, buzilmaydi)

1. **AI database faktini hech qachon o'ylab topmaydi.** Har bir raqam/fakt real Supabase so'rovidan keladi.
2. **Ma'lumot topilmasa** — AI "Ma'lumot topilmadi" yoki "Buni aniqlash uchun ... kerak" deydi, taxmin qilmaydi.
3. **Moliyaviy hisob-kitob AI tomonidan ixtiro qilinmaydi.** `src/lib/finance.ts` (Rule 12 — markazlashgan hisob-kitob qatlami) yagona haqiqat manbai; AI faqat undan foydalanadi (§7).
4. **READ va ACTION qat'iy ajratilgan.** READ — confirmation shart emas, darhol bajariladi. ACTION (mutating) — confirmation SHART.
5. **Moliyaviy/xavfli ACTION:** AI → preview → confirmation → authorization (qayta) → atomik execution → audit → Telegram natija.
6. **Staff identity HECH QACHON LLM'dan olinmaydi.** Har doim Telegram `message.from.id` / `callback_query.from.id` → DB'dan real `staff` qatoriga hal qilinadi (`src/lib/ai/resolve-staff.ts`).
7. **`callback_data` ichida authorization ma'lumoti (staff_id/role) bo'lmaydi** — faqat `pending_ai_action.id`. Autentifikatsiya har doim Telegram identifikatsiyasidan qayta hal qilinadi.
8. **AI raw/arbitrary SQL bajara olmaydi.** READ uchun faqat whitelist qilingan safe query/analytics qatlami (`src/lib/ai/analytics/*`) — INSERT/UPDATE/DELETE/DROP/ALTER bu qatlam orqali HECH QACHON mumkin emas.
9. **Universal READ query engine** (`analytics_query`) filter/date-range/group-by/sum/count/avg/min/max/sort/limit/whitelist qilingan relationship'larni qo'llab-quvvatlaydi — lekin faqat `src/lib/ai/analytics/schema.ts`da e'lon qilingan jadval/maydonlar bilan.
10. **ACTION faqat mavjud authorized business tools/service layer orqali** (`src/lib/services/*`) — AI hech qachon o'z mutation mantig'ini yozmaydi.

## 3. ARXITEKTURA (qisqacha xarita)

```
Telegram → webhook (route.ts, secret_token tekshiradi)
  → resolveStaffFromTelegram (tg_id → real staff, HAR DOIM DB'dan)
    → handleAiMessage (dispatch.ts)
       1) pending_clarifications tekshiriladi (bor bo'lsa, oldingi savol + yangi xabar birlashtiriladi — §5)
       2) LLM chaqiriladi (Gemini, provider abstraksiyasi orqali — Claude ham qo'shilishi mumkin)
       3) javob: MATN (oddiy/aniqlashtirish) YOKI BITTA tool-chaqiruvi
       4) tool whitelist'da (executor.ts) + rol tekshiriladi + validate()
       5a) READ (mutating:false) → darhol execute() → natija → audit
       5b) ACTION (mutating:true) → resolve() (nom→ID, preview) → pending_ai_actions →
           tasdiqlash tugmasi → callback_query → qayta autentifikatsiya → atomik claim →
           execute() → audit → Telegram natija
```

**Asosiy fayllar:**
- `src/lib/ai/dispatch.ts` — bosh orkestrator (`handleAiMessage`), system prompt shu yerda quriladi.
- `src/lib/ai/executor.ts` — tool registry (whitelist), rol tekshiruvi.
- `src/lib/ai/tool-types.ts` — `ToolDefinition` shakli (`validate/resolve/execute`).
- `src/lib/ai/tools/read.ts` — nomlangan READ tool'lar (revenue/profit/full-report/expenses/customer-debt/sessions-in-range).
- `src/lib/ai/tools/operational.ts` — stol ochish/mahsulot qo'shish/vaqt tuzatish/yopish.
- `src/lib/ai/tools/financial.ts` — xarajat/qarz to'lovi/qaytarim/oylik (moliyaviy, xavfli).
- `src/lib/ai/tools/analytics.ts` — universal `analytics_metric`/`analytics_query`.
- `src/lib/ai/analytics/*` — schema whitelist, query-plan validator, query-executor (faqat Supabase query builder), metrics (finance.ts'ga delegatsiya), formatter+CSV.
- `src/lib/ai/tools/resolve-helpers.ts` — nom/raqam/tur → real DB obyekti (`resolveTable`, `resolveProductByName`, ...).
- `src/lib/ai/pending-actions.ts` — tasdiqlash navbati (`pending_ai_actions`).
- `src/lib/ai/clarification.ts` — ko'p-bosqichli aniqlashtirish konteksti (`pending_clarifications`, §5).
- `src/lib/finance.ts` — markazlashgan moliyaviy hisob-kitob (§7).
- `src/lib/calc.ts` — bitta sessiya uchun hisob-kitob (stol narxi, loyalty, deposit).
- `src/lib/services/sessions.ts`, `debts.ts` — Web App VA AI ikkalasi ham chaqiradigan yagona biznes-mantiq.

**Xodim rollari** (`StaffRole`, `src/lib/types.ts`): `super_admin`, `admin`, `operator`, `cashier`. AI tool'larining `allowedRoles` HAR DOIM mos Web App API route'ning rol talabini takrorlaydi (kengaytirmaydi, qisqartirmaydi).

## 4. CONTEXT MODELI

Ikki xil narsa bir-biriga aralashtirilmaydi:

**A. Short-term (aniqlashtirish) kontekst** — `pending_clarifications` jadvali. Faqat AI keyingi bitta savolga aniqlashtiruvchi savol berganda ishlaydi (masalan "5 stolga 2 kola" → "qaysi hajmda?" → "1.5 lik"). 5 daqiqa muddat, chat+xodim bo'yicha BITTA yozuv, bir martalik iste'mol. Bu — AMALIY yordam, chuqur "suhbat xotirasi" EMAS.

**B. Long-term (database history)** — Supabase'dagi barcha tarixiy ma'lumot, doim saqlanadi. "15-iyul kuni 1-stolda nima bo'lgan?" kabi savollar bunga tayanadi — eski chat xabarlariga emas, `analytics_query`/nomlangan tool'lar orqali DB'dan qayta topiladi.

Sessiya (stol) yopilganda faqat OPERATIVE kontekst (masalan "faol sessiya bormi") tugaydi — DB tarixi hech qachon yo'qolmaydi.

AI model context window'iga BUTUN database yoki BUTUN chat tarixi yuborilmaydi — har doim kerakli qism aniq so'rov orqali topiladi (§8, database-analyst skill).

## 5. MAHSULOT / HAJM TUSHUNCHASI

`products` jadvalida **variant uchun alohida ustun yo'q** — "Coca-Cola 0.5L" va "Coca-Cola 1.5L" ikkita ALOHIDA qator (har biri o'z nomi/narxi/ombori bilan). Shuning uchun:

- "1.5 Cola" / "1.5 lik Cola" → ehtimol 1.5L variant.
- "2 Cola" → noaniq (2 DONA yagona Colami, yoki 2 LITRLIK variantmi?).
- AI katalogni (`resolveProductByName`, ILIKE qidiruv) tekshiradi; agar bir nechta mos nom topilsa va aniq bo'lmasa, **qisqa** aniqlashtiruvchi savol beradi (§2-bo'limdagi `[CLARIFY]` konvensiyasi bilan, §4-Context yordamida keyingi javob avtomatik bog'lanadi). Admin keyboard bilan majburlanmaydi — oddiy matn bilan javob bersa kifoya.

## 6. FINANCE QOIDALARI (qulflangan — `finance.ts`dagi Rule 1/2/12 bilan bir xil)

**2026-08 "Finance Simplification":** klub kichik, real inventory/stock boshqaruvi olib borilmaydi — shuning uchun Finance'ning STANDART, birinchi darajali modeli MAKSIMAL SODDA:

- **KELDI** = `getReceivedRevenue()` — REAL qabul qilingan pul (sessiyalardan naqd/karta + davr ICHIDA to'langan qarz to'lovlari − qaytarimlar). **DEBT ≠ REVENUE** — ochiq qarz tushum emas; qarz keyin to'lansa, TO'LANGAN kundagi KELDI'ga kiradi (cash-basis), qarz yaratilgan kuniga emas.
- **KETDI** = operatsion xarajat (`expenses`, KATEGORIYASIZ — admin faqat ozod matnli nom yozadi, masalan "Svet", "Cola") + davr ichida haqiqatda to'langan oylik. Ombor/mahsulot xaridi HAM shu yerda, oddiy `expenses` yozuvi sifatida ("Colaga 300 ming ketdi") — alohida `inventory_purchases`/COGS orqali EMAS.
- **FOYDA** = KELDI − KETDI (`getSimpleFinanceSummary()`, `finance.ts` §6b). COGS QASDDAN ayirilmaydi — chunki ombor xaridi allaqachon KETDI'da hisobga olingan; COGS'ni ham ayirish IKKI MARTA hisoblash bo'lardi. Bu — `analytics_metric`ning standart `simple_finance` nomi va Finance UI/kunlik hisobotning BIRINCHI ko'rsatadigan 3 ta raqami.
- Admin xarajat kiritishda **kategoriya tanlashga majburlanmaydi** (`record_expense`/`ExpenseAddSheet`da kategoriya ixtiyoriy, standart bo'sh). Xarajat tarixi/tahlili nom (`expenses.name`, erkin matn) bo'yicha — "iyulda elektrga qancha ketgan?" kabi savollar `analytics_query`ning `name` filtri (ilike) orqali javob topadi, oldindan kategoriya yaratish shart emas.

**Ikkinchi darajali/ADVANCED model (o'chirilmagan, lekin standart EMAS)** — faqat admin ANIQ "COGS"/"tannarx"/"ombor asosidagi foyda" deb so'raganda ishlatiladi (`analytics_metric`: `cogs`/`gross_profit`/`estimated_net_profit`):
- **COGS** — sotuv paytidagi tannarx (`session_orders.unit_cost_at_sale`, snapshot; faqat `trackInventory=true` mahsulotlar uchun to'ldiriladi). Keyingi tannarx o'zgarishi eski hisobotlarni O'ZGARTIRMAYDI.
- **"TAXMINIY sof foyda"** (`estimatedNetProfit`) = Real qabul qilingan tushum − COGS − Operatsion xarajat − Oylik — hech qachon "aniq"/"sof" deb qisqartirilmaydi, har doim `PROFIT_DISCLAIMER` bilan birga ko'rsatiladi. Bu modelni ishlatish uchun ombor xaridi `inventory_purchases` orqali (Finance UI'dan olib tashlangan, backend saqlangan) yozilishi kerak — aks holda oddiy `expenses` orqali yozilgan xarid bilan ARALASHTIRILSA, xarajat IKKI MARTA hisoblanadi. Amalda bu klub uchun kerak emas (§4 pastda).
- **Umumiy xarajat** (elektr, ijara, umumiy ish haqi) stolga o'zboshimchalik bilan taqsimlanmaydi. Stol darajasidagi "direct profit" (tushum − to'g'ridan-to'g'ri stol xarajati) va klub darajasidagi "net profit" ALOHIDA tushunchalar — aralashtirilmaydi.
- AI moliyaviy savolga javob berishda HAR DOIM `analytics_metric` (→ `finance.ts`) ishlatadi, `analytics_query` bilan o'zi yig'indi/formula "hisoblab" bermaydi.

## 6b. OMBOR/INVENTORY — MAJBURIY EMAS

Klub hozircha real ombor/stock boshqaruvini olib bormaydi. `products.trackInventory`/`unitCost`/`stockQty`, `inventory_purchases` jadvali va `computeWeightedAverageCost`/`consumeInventoryOnSale` (`finance.ts`) DB/kod darajasida SAQLANGAN (boshqa funksiyalar — masalan sotuvda `unit_cost_at_sale` suratga olish — shularga bog'liq bo'lishi mumkin), lekin: Finance UI'dagi "Ombor xaridi" tab olib tashlangan (faqat Sozlamalar → Mahsulotlar'dagi `trackInventory` toggle qoladi), va AI/Admin BUNI ishlatishga MAJBURLANMAYDI. Yangi mahsulot xaridi — oddiy `record_expense` (xarajat) orqali yoziladi (§6).

## 7. AUDIT

Har bir mutation `audit_log`ga yoziladi: kim (`staff_id`/`staff_name`/`role`), qachon (`at`), nima (`action`), qaysi tool/qaysi obyekt va natija (`metadata` — `{tool, args, result}`), qaysi manbadan (`source`: `"web"` yoki `"telegram_ai"`). AI action'lari ham xuddi shu Telegram Audit kanal oqimidan o'tadi (`telegram-log.ts`). Super Admin Alert kanali alohida — faqat muhim moliyaviy/xavfsizlik hodisalari uchun (hozircha `enabled=false`, infratuzilma tayyor).

## 8. AI ACTION UX (namuna)

```
Admin: "5 stolni och"
AI:    🎱 Stol №5 ni ochish
       Tasdiqlaysizmi?
       [✅ Tasdiqlash] [❌ Bekor qilish]
```

Tasdiqdan keyin: qayta autentifikatsiya (Telegram `from.id`dan) → holat qayta tekshiriladi (masalan stol orada boshqa admin tomonidan ochilgan bo'lsa — bajarilmaydi, "holat o'zgardi" deb tushuntiriladi) → atomik execution → audit → natija. Bu — mavjud, ishlab turgan mexanizm (`pending_ai_actions` state machine + optimistik qulf), o'zgartirilmaydi.

## 9. READ UX

READ savollar uchun HECH QANDAY tasdiqlash/keyboard yo'q — darhol javob. Har bir yangi savol uchun alohida tool YARATILMAYDI: nomlangan moliyaviy metrikalar (`analytics_metric`) va universal strukturaviy so'rov (`analytics_query`, §2-bo'lim, qoida 9) mavjud savollarning aksariyatini qamrab oladi (§8 — database-analyst skill).

## 10. TASHQI MAVZULAR

Admin "bugun ob-havo qanday?" desa, AI tashqi mavzuga chiqmaydi — "Men klub boshqaruvi va ma'lumotlari bo'yicha yordam bera olaman" kabi qisqa javob beradi. Klub ma'lumotiga oid savolga (masalan "bugun qancha tushum bo'ldi?") DOIM database'dan javob beradi.

## 11. KATTA NATIJALAR

100+ qatorli yoki foydalanuvchi "to'liq eksport" so'ragan natijalar Telegram xabariga minglab qator qilib yuborilmaydi — CSV fayl (`sendDocument`) sifatida beriladi (`analytics_query`da avtomatik, 15 qatordan ko'p bo'lsa). ".xlsx" hozircha kutubxona cheklovi tufayli CSV bilan almashtirilgan — bu bilinadigan, hujjatlashtirilgan trade-off.

## 12. RESPONSE STYLE

O'zbek tilida, tabiiy, qisqa, raqamlar ajratilgan (`fmtMoney`), keraksiz texnik atamasiz. Tool nomlari foydalanuvchiga ko'rsatilmaydi. Xato bo'lsa — "Ma'lumotni olishda texnik xatolik yuz berdi" kabi, lekin hech qachon fakt to'qilmaydi.

## 13. SKILLS

Batafsil, operatsion qoidalar `.claude/skills/`da:

- `club-business/SKILL.md` — domain modeli (real schema asosida).
- `database-analyst/SKILL.md` — NL → query-plan metodologiyasi.
- `finance/SKILL.md` — buxgalteriya semantikasi.
- `ai-admin/SKILL.md` — NL buyruqlar, ambiguity, confirmation, correction.
- `telegram-ux/SKILL.md` — javob formati, export qoidalari.
- `security/SKILL.md` — auth/authorization/audit/duplicate-prevention.

## 14. DEVELOPER UCHUN ESLATMA

- Mavjud ishlayotgan flow'larni (Web App, `/start`, kontakt, kanal-forward, mavjud AI tool'lar) BUZMANG.
- Yangi savol/vazifa uchun avval mavjud universal `analytics_query`/`analytics_metric` orqali yechim izlang — har bir savol uchun alohida `get_xxx` tool yaratish oxirgi chora.
- Har bir katta o'zgarishdan keyin: `npx tsc --noEmit`, `npm run build`, mavjud offline testlarni qayta ishga tushiring (sandbox tarmoq cheklovi tufayli haqiqiy Gemini/Supabase/Telegram bilan avtomatik test qilib bo'lmaydi — bu har doim aniq belgilanadi, "test qilindi" deb yolg'on aytilmaydi).
- Schema'da yo'q narsani o'ylab topmang — avval `supabase/schema.sql` + `supabase/migrations/*`ni tekshiring.
