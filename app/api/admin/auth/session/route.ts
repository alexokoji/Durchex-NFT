import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth/currentAdmin";

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin(req);
  if (!admin) return NextResponse.json({ admin: null });
  return NextResponse.json({ admin: { username: admin.username } });
}
