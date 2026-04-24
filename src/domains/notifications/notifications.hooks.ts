import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type NotificationRow = Tables<"notifications">;

export async function createNotification(userId: string, type: string, message: string, relatedId?: string) {
  return supabase.from("notifications").insert({ user_id: userId, type, message, related_id: relatedId ?? null });
}

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetch = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    const items = data ?? [];
    setNotifications(items);
    setUnreadCount(items.filter((n) => !n.is_read).length);
  };

  useEffect(() => {
    fetch();
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => { fetch(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return { notifications, unreadCount, refetch: fetch };
}

export async function markNotificationRead(id: string) {
  return supabase.from("notifications").update({ is_read: true }).eq("id", id);
}

export async function markAllNotificationsRead(userId: string) {
  return supabase.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
}
