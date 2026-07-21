import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ user: null });

  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ user: null });

  await connectDB();
  const user = await User.findOne({ address: session.address }).lean();
  if (!user) return NextResponse.json({ user: null });

  return NextResponse.json({
    user: {
      address: user.address,
      username: user.username,
      isVerified: !!user.isVerified,
      nextVoucherNonce: user.nextVoucherNonce ?? 0,
    },
  });
}
