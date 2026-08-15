import { redirect } from "next/navigation";
import { getCurrentUserFromCookies } from "@/lib/auth/currentUser";

export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  if (!(await getCurrentUserFromCookies())) redirect("/?connect=required");
  return children;
}
