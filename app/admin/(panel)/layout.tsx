import { redirect } from "next/navigation";
import { getCurrentAdminFromCookies } from "@/lib/auth/currentAdmin";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export const dynamic = "force-dynamic";

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdminFromCookies();
  if (!admin) redirect("/admin/login");

  return (
    <div className="flex min-h-screen bg-void">
      <AdminSidebar username={admin.username} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
