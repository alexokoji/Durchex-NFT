import { NextRequest, NextResponse } from "next/server";
import { SiweMessage } from "siwe";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { NONCE_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const { message, signature } = await req.json();
  if (!message || !signature) {
    return NextResponse.json({ error: "message and signature are required" }, { status: 400 });
  }

  const expectedNonce = req.cookies.get(NONCE_COOKIE)?.value;
  if (!expectedNonce) {
    return NextResponse.json({ error: "Missing or expired nonce, request a new one" }, { status: 400 });
  }

  let siwe: SiweMessage;
  try {
    siwe = new SiweMessage(message);
    const result = await siwe.verify({ signature, nonce: expectedNonce });
    if (!result.success) throw new Error("Signature verification failed");
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const address = siwe.address.toLowerCase();

  await connectDB();
  let user = await User.findOne({ address });
  const isNewUser = !user;
  if (!user) {
    user = await User.create({
      address,
      username: `user_${address.slice(2, 8)}`,
    });
  }

  const token = await createSessionToken({ address });

  const res = NextResponse.json({
    address,
    username: user.username,
    isVerified: user.isVerified,
    verificationTier: user.verificationTier ?? "none",
    avatarUrl: user.avatarUrl ?? "",
    isNewUser,
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  res.cookies.delete(NONCE_COOKIE);
  return res;
}
