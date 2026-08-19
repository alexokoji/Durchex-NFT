import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { checkCreationAllowed } from "@/lib/creationGate";

export const dynamic = "force-dynamic";

// Lets the create flow say up front that creation is closed, instead of
// letting someone fill in four steps and sign a voucher only to be
// refused by POST /api/collections. The API check remains the real gate.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ open: true });
  await connectDB();
  const gate = await checkCreationAllowed(user.address);
  return NextResponse.json(
    gate.allowed ? { open: true } : { open: false, reason: gate.error }
  );
}
