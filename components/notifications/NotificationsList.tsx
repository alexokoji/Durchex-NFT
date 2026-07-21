"use client";

import { useState } from "react";
import { BellOff } from "lucide-react";
import { NotificationRow } from "@/components/notifications/NotificationRow";
import { NotificationView } from "@/lib/types";

export function NotificationsList({ initial }: { initial: NotificationView[] }) {
  const [notifications, setNotifications] = useState(initial);
  const unreadCount = notifications.filter((n) => !n.read).length;

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await fetch("/api/notifications/read-all", { method: "POST" });
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BellOff className="w-10 h-10 text-purple-500/40 mb-3" />
        <p className="text-sm text-white/40">No notifications yet.</p>
      </div>
    );
  }

  return (
    <div>
      {unreadCount > 0 && (
        <div className="flex justify-end mb-3">
          <button
            onClick={markAllRead}
            className="text-xs font-medium text-purple-300 hover:text-white transition"
          >
            Mark all read
          </button>
        </div>
      )}
      <div className="surface-card p-2 sm:p-3">
        {notifications.map((n) => (
          <NotificationRow key={n.id} notification={n} onRead={markRead} />
        ))}
      </div>
    </div>
  );
}
