import { redirect } from "next/navigation";

/**
 * Alohida "Bosh sahifa" (dashboard) endi yo'q — navigatsiya qayta
 * qurildi (Stollar / Hisobotlar / Moliya / Sozlamalar). /admin ochilganda
 * to'g'ridan-to'g'ri Stollarga yo'naltiriladi (standart sahifa).
 */
export default function AdminRootPage() {
  redirect("/admin/tables");
}
