import { NextResponse } from "next/server";
import { clearStaffSession } from "@/lib/session";

export async function POST() {
  clearStaffSession();
  return NextResponse.json({ ok: true });
}
