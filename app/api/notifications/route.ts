import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { getNotifications } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ notifications: [], unreadCount: 0 });
  }

  const { notifications, unreadCount } = await getNotifications(String(user._id));
  return NextResponse.json({ notifications, unreadCount });
}
