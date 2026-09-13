import "server-only";

/**
 * Tabiiy tildagi pul ifodalarini (so'm) butun songa aylantiradi —
 * fast-path router (`fast-path.ts`) uchun. LLM (Gemini)ga MUROJAAT
 * QILINMAYDI — bu sof, deterministik matn tahlili, hech qanday tashqi
 * chaqiruv yo'q.
 *
 * Qo'llab-quvvatlanadigan shakllar: "300 ming", "300ming", "1.5 million",
 * "1,5 mln", "150000", "150 000", "700000 so'm".
 *
 * MUHIM: bu funksiya faqat fast-path uchun — noaniq/nostandart yozilgan
 * summalar uchun `undefined` qaytaradi (ya'ni "aniqlay olmadim"), fast-path
 * bunday holatda mos kelmagan deb hisoblab, so'rovni odatdagidek Gemini'ga
 * yuboradi (hech qachon noto'g'ri summa bilan davom etmaydi).
 */

const MULTIPLIER_WORD = /^(ming|mln|million)$/i;

function multiplierValue(word: string | undefined): number {
  if (!word) return 1;
  const w = word.toLowerCase();
  if (w === "million" || w === "mln") return 1_000_000;
  if (w === "ming") return 1_000;
  return 1;
}

/**
 * Matndan BIRINCHI ishonchli pul summasini topadi. Ikki xil shaklni
 * qo'llab-quvvatlaydi:
 *  1) Raqam + so'z ko'paytiruvchi ("300 ming", "1.5 million") — bunda
 *     kasr qismi ("1.5") o'nlik kasr sifatida o'qiladi.
 *  2) Faqat raqam, ko'paytiruvchisiz ("150000", "150 000") — bunda
 *     bo'shliq/nuqta/vergul MINGLIK AJRATGICH sifatida olib tashlanadi.
 *
 * MINIMAL_AMOUNT (1000 so'm) dan kichik natijalar `undefined` qaytaradi —
 * bunday kichik son ehtimol summa emas (masalan mahsulot soni), xato
 * xarajat yozilishining oldi olinadi.
 */
export function parseAmountSom(text: string, minAmount = 1000): number | undefined {
  // 1) Raqam + ko'paytiruvchi so'z (eng ishonchli shakl).
  const withMultiplier = text.match(/(\d+(?:[.,]\d+)?)\s*(ming|mln|million)\b/i);
  if (withMultiplier) {
    const base = parseFloat(withMultiplier[1].replace(",", "."));
    if (Number.isFinite(base) && base > 0) {
      const amount = Math.round(base * multiplierValue(withMultiplier[2]));
      if (amount >= minAmount) return amount;
    }
  }

  // 2) Faqat raqam (ko'paytiruvchisiz) — kamida 4 xonali (1000+) bo'lishi
  //    kerak, aks holda "2 kola" kabi miqdorlar bilan aralashib ketishi
  //    mumkin (bu funksiya faqat pul summasi qidiradi).
  const plain = text.match(/\b(\d[\d\s]{2,}\d|\d{4,})\b/);
  if (plain) {
    const cleaned = plain[1].replace(/[\s.,]/g, "");
    const amount = parseInt(cleaned, 10);
    if (Number.isFinite(amount) && amount >= minAmount) return amount;
  }

  return undefined;
}
