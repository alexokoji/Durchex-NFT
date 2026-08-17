import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { connectDB } from "@/lib/db";
import { AdminUser } from "@/lib/models/AdminUser";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/auth/adminSession";

async function resolveAdmin(token: string | undefined) {
  if (!token) return null;
  const session = await verifyAdminSessionToken(token);
  if (!session) return null;

  await connectDB();
  const admin = await AdminUser.findById(session.adminId);
  return admin ?? null;
}

/** Resolves the signed-in admin's Mongo document from the admin session cookie, or null. */
export async function getCurrentAdmin(req: NextRequest) {
  return resolveAdmin(req.cookies.get(ADMIN_SESSION_COOKIE)?.value);
}

/** Same as getCurrentAdmin, but for Server Components (no NextRequest available). */
export async function getCurrentAdminFromCookies() {
  const cookieStore = await cookies();
  return resolveAdmin(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}
