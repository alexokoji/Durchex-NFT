import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

async function resolveUser(token: string | undefined) {
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;

  await connectDB();
  const user = await User.findOne({ address: session.address });
  // A banned user is treated as signed out everywhere this is called —
  // blocks listing, bidding, minting, etc. without touching every route.
  if (user?.banned) return null;
  return user;
}

/** Resolves the signed-in user's Mongo document from the session cookie, or null. */
export async function getCurrentUser(req: NextRequest) {
  return resolveUser(req.cookies.get(SESSION_COOKIE)?.value);
}

/** Same as getCurrentUser, but for Server Components (no NextRequest available). */
export async function getCurrentUserFromCookies() {
  const cookieStore = await cookies();
  return resolveUser(cookieStore.get(SESSION_COOKIE)?.value);
}
