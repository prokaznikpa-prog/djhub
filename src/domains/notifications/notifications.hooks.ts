import { useCallback, useEffect, useState } from "react";
import type { Tables } from "@/integrations/supabase/types";

export type NotificationRow = Tables<"notifications">;

export async function createNotification(
  _userId: string,
  _type: string,
  _message: string,
  _relatedId?: string
) {
  return { data: null, error: null };
}

export function useNotifications(_userId: string | undefined) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refetch = useCallback(async () => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, [_userId]);

  return { notifications, unreadCount, refetch };
}

export async function markNotificationRead(_id: string) {
  return { data: null, error: null };
}

export async function markAllNotificationsRead(_userId: string) {
  return { data: null, error: null };
}