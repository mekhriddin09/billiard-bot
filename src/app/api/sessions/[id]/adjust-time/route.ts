import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { adjustTimeCore } from "@/lib/services/sessions";
import { runService } from "@/lib/services/http";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const { minutes } = await req.json().catch(() => ({}));
  const supabase = supabaseServer();

  return runService(() => adjustTimeCore(supabase, auth, { sessionId: params.id, minutes }));
}
