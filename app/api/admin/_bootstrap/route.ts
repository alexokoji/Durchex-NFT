import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { AdminUser } from "@/lib/models/AdminUser";
import { hashAdminPassword } from "@/lib/auth/adminPassword";

// Temporary, secret-gated one-off route to seed the first AdminUser —
// removed after use. Not linked from any UI.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-bootstrap-secret");
  if (!secret || secret !== process.env.ADMIN_BOOTSTRAP_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!username || password.length < 8) {
    return NextResponse.json({ error: "username and password (8+ chars) are required" }, { status: 400 });
  }

  await connectDB();
  const { hash, salt } = hashAdminPassword(password);
  const admin = await AdminUser.findOneAndUpdate(
    { username },
    { username, passwordHash: hash, passwordSalt: salt },
    { new: true, upsert: true }
  );

  return NextResponse.json({ username: admin.username, id: String(admin._id) });
}
