"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Images, Users, ShieldAlert, Settings, LogOut } from "lucide-react";
import clsx from "clsx";
import { LogoMark } from "@/components/layout/Logo";

const LINKS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/collections", label: "Collections", icon: Images },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/moderation", label: "Moderation", icon: ShieldAlert },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminSidebar({ username }: { username: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <aside className="w-60 shrink-0 border-r border-white/5 bg-surface-1 min-h-screen flex flex-col">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-white/5">
        <LogoMark className="w-7 h-7" />
        <span className="font-display font-semibold text-white text-sm">Durchex Admin</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {LINKS.map((link) => {
          const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition",
                active ? "bg-purple-500/15 text-purple-100 border border-purple-500/30" : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
              )}
            >
              <Icon className="w-4 h-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-4 border-t border-white/5">
        <p className="px-3 text-xs text-white/35 mb-2 truncate">Signed in as {username}</p>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
