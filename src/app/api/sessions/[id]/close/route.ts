import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { closeSessionCore } from "@/lib/services/sessions";
import { runService } from "@/lib/services/http";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const supabase = supabaseServer();

  return runService(() =>
    closeSessionCore(supabase, auth, {
      sessionId: params.id,
      method: body.method,
      useReward: body.useReward,
      paymentStatus: body.paymentStatus,
      paidAmount: body.paidAmount,
      note: body.note,
      debtDueDate: body.debtDueDate,
      cashAmount: body.cashAmount,
      cardAmount: body.cardAmount,
    })
  );
}
