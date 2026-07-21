import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE = "durchex_session";
const NONCE_COOKIE = "durchex_siwe_nonce";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  address: string;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ address: payload.address })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.address !== "string") return null;
    return { address: payload.address };
  } catch {
    return null;
  }
}

export { SESSION_COOKIE, NONCE_COOKIE, SESSION_MAX_AGE_SECONDS };
