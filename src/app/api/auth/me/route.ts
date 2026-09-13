import { NextResponse } from "next/server";
import { getAuthedStaff } from "@/lib/api-auth";

export async function GET() {
  const staff = await getAuthedStaff();
  return NextResponse.json({ staff });
}
