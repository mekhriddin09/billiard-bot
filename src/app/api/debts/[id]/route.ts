import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { isDebtFinancialCorrection, updateDebtCore } from "@/lib/services/debts";
import { runService } from "@/lib/services/http";

interface DebtPatchBody {
  note?: string;
  dueDate?: string | null;
  /** Faqat Super Admin: summani orqaga tuzatish (xato yozilgan bo'lsa). */
  originalAmount?: number;
  reason?: string;
}

/**
 * Izoh/muddat qo'shish — oddiy operatsion amal, har qanday faol xodim.
 * Asl summani (originalAmount) tuzatish — moliyaviy KORREKSIYA, faqat
 * Super Admin, va sabab (reason) talab qilinadi.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = (await req.json().catch(() => ({}))) as DebtPatchBody;
  const isFinancialCorrection = isDebtFinancialCorrection(body);

  const auth = await requireStaff(isFinancialCorrection ? ["super_admin"] : undefined);
  if (auth instanceof NextResponse) return auth;

  const supabase = supabaseServer();

  return runService(() =>
    updateDebtCore(supabase, auth, {
      debtId: params.id,
      note: body.note,
      dueDate: body.dueDate,
      originalAmount: body.originalAmount,
      reason: body.reason,
    })
  );
}
