import { getCurrentUser, getCurrentUserFromCookies } from "@/lib/auth/currentUser";

function configuredAdmins() {
  return new Set(
    (process.env.ADMIN_WALLET_ADDRESSES ?? "")
      .split(",")
      .map((address) => address.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminUser(user: { address?: string; role?: string } | null) {
  if (!user) return false;
  return user.role === "admin" || user.role === "moderator" || configuredAdmins().has(user.address?.toLowerCase() ?? "");
}

export async function getAdminFromRequest(req: Parameters<typeof getCurrentUser>[0]) {
  const user = await getCurrentUser(req);
  return isAdminUser(user) ? user : null;
}

export async function getAdminFromCookies() {
  const user = await getCurrentUserFromCookies();
  return isAdminUser(user) ? user : null;
}
