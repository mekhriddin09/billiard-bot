/**
 * Service-layer funksiyalari (src/lib/services/*) HTTP'ni bilmaydi —
 * ular HTTP route'lar UCHUN HAM, kelajakdagi AI tool executor UCHUN HAM
 * bir xil ishlatiladi. Xato holatlarida NextResponse qaytarish o'rniga
 * shu klassni throw qiladi; har ikkala chaqiruvchi o'zi mos formatga
 * o'giradi (HTTP route — NextResponse.json({error}, {status}), AI
 * executor — Telegram xabari).
 */
export class ServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ServiceError";
    this.status = status;
  }
}
