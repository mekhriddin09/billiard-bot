import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Faqat server tomonida ishlatiladi (API route / server action).
 * service_role kaliti hech qachon brauzerga chiqmaydi — bu fayl
 * "server-only" bilan belgilangan, client komponentga import qilinsa
 * build vaqtida xato beradi.
 */
export function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase sozlanmagan: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY .env.local'da yo'q."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
