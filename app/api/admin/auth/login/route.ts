import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { AdminUser } from "@/lib/models/AdminUser";
import { verifyAdminPassword } from "@/lib/auth/adminPassword";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE_SECONDS, createAdminSessionToken } from "@/lib/auth/adminSession";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }

  await connectDB();
  const admin = await AdminUser.findOne({ username });
  if (!admin || !verifyAdminPassword(password, admin.passwordHash, admin.passwordSalt)) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  admin.lastLoginAt = new Date();
  await admin.save();

  const token = await createAdminSessionToken({ adminId: String(admin._id), username: admin.username });
  const res = NextResponse.json({ username: admin.username });
  res.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  return res;
}
