"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationRow } from "@/components/notifications/NotificationRow";

export function NotificationBell() {
  const { user } = useSession();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative w-9 h-9 rounded-lg grid place-items-center text-white/70 hover:text-white hover:bg-white/5 transition"
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-[3px] rounded-full bg-purple-600 text-[9px] font-bold text-white grid place-items-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[28rem] overflow-y-auto glass-panel rounded-xl shadow-xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 sticky top-0 bg-surface-2/95 backdrop-blur">
            <span className="text-sm font-semibold text-white">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-purple-300 hover:text-white transition"
              >
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-10">You&apos;re all caught up.</p>
          ) : (
            <div className="p-1.5">
              {notifications.map((n) => (
                <NotificationRow key={n.id} notification={n} onRead={markRead} />
              ))}
            </div>
          )}
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block text-center text-xs font-medium text-purple-300 hover:text-white py-3 border-t border-white/10 transition"
          >
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
