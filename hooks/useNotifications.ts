"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/useSession";
import { NotificationView } from "@/lib/types";

interface NotificationsResponse {
  notifications: NotificationView[];
  unreadCount: number;
}

export function useNotifications() {
  const { user } = useSession();
  const queryClient = useQueryClient();

  const query = useQuery<NotificationsResponse>({
    queryKey: ["notifications"],
    queryFn: () => fetch("/api/notifications").then((r) => r.json()),
    enabled: !!user,
    refetchInterval: 20_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    refresh();
  }

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    refresh();
  }

  return {
    notifications: query.data?.notifications ?? [],
    unreadCount: query.data?.unreadCount ?? 0,
    isLoading: query.isLoading,
    markRead,
    markAllRead,
  };
}
