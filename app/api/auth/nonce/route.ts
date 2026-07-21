import { NextResponse } from "next/server";
import { generateNonce } from "siwe";
import { NONCE_COOKIE } from "@/lib/auth/session";

export async function POST() {
  const nonce = generateNonce();

  const res = NextResponse.json({ nonce });
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 5, // 5 minutes
    path: "/",
  });
  return res;
}
