import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FeedbackType = "bug" | "suggestion" | "complaint" | "other";
export type FeedbackStatus = "new" | "in_progress" | "done";

export interface FeedbackItem {
  id: string;
  user_id: string;
  type: FeedbackType;
  message: string;
  status: FeedbackStatus;
  admin_note: string | null;
  created_at: string;
}

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  bug: "Ошибка",
  suggestion: "Идея",
  complaint: "Жалоба",
  other: "Другое",
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "Новая",
  in_progress: "В работе",
  done: "Готово",
};

export async function createFeedback(userId: string, type: FeedbackType, message: string) {
  return (supabase.from("feedback" as any) as any)
    .insert({
      user_id: userId,
      type,
      message: message.trim(),
    })
    .select("id")
    .single();
}

export async function updateFeedbackStatus(id: string, status: FeedbackStatus) {
  return (supabase.from("feedback" as any) as any)
    .update({ status })
    .eq("id", id)
    .select("id, status")
    .maybeSingle();
}

export function useAllFeedback(enabled = true) {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = async () => {
    if (!enabled) return;
    setLoading(true);
    const { data, error } = await (supabase.from("feedback" as any) as any)
      .select("id,user_id,type,message,status,admin_note,created_at")
      .order("created_at", { ascending: false });
    setLoading(false);

    if (error) {
      console.error("Failed to load feedback", error);
      return;
    }

    setFeedback((data ?? []) as FeedbackItem[]);
  };

  useEffect(() => {
    void refetch();
  }, [enabled]);

  return { feedback, loading, refetch, setFeedback };
}
