import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { startSessionCore } from "@/lib/services/sessions";
import { runService } from "@/lib/services/http";

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const { tableId, phone } = await req.json().catch(() => ({}));
  const supabase = supabaseServer();

  return runService(() => startSessionCore(supabase, auth, { tableId, phone }));
}
