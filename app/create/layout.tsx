import { redirect } from "next/navigation";
import { getCurrentUserFromCookies } from "@/lib/auth/currentUser";

export default async function CreateLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect("/?connect=required");
  return children;
}
