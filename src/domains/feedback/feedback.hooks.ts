import { useEffect, useState } from "react";

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
  bug: "РћС€РёР±РєР°",
  suggestion: "РРґРµСЏ",
  complaint: "Р–Р°Р»РѕР±Р°",
  other: "Р”СЂСѓРіРѕРµ",
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "РќРѕРІР°СЏ",
  in_progress: "Р’ СЂР°Р±РѕС‚Рµ",
  done: "Р“РѕС‚РѕРІРѕ",
};

const API_URL = import.meta.env.VITE_API_URL;
const REQUEST_TIMEOUT_MS = 6000;

async function fetchJson<T>(url: string, init: RequestInit | undefined, fallback: T): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) return fallback;

    const payload = await response.json() as { ok?: boolean; data?: T };
    return payload.data ?? fallback;
  } catch {
    return fallback;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function createFeedback(userId: string, type: FeedbackType, message: string) {
  const data = await fetchJson<{ id: string } | null>(
    `${API_URL}/api/feedback`,
    {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        type,
        message: message.trim(),
      }),
    },
    null,
  );

  return { data, error: data ? null : new Error("Не удалось отправить feedback") };
}

export async function updateFeedbackStatus(id: string, status: FeedbackStatus) {
  const data = await fetchJson<{ id: string; status: FeedbackStatus } | null>(
    `${API_URL}/api/feedback/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    },
    null,
  );

  return { data, error: data ? null : new Error("Не удалось обновить feedback") };
}

export function useAllFeedback(enabled = true) {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = async () => {
    if (!enabled) return;
    setLoading(true);
    const data = await fetchJson<FeedbackItem[]>(
      `${API_URL}/api/feedback`,
      undefined,
      [],
    );
    setLoading(false);
    setFeedback(data ?? []);
  };

  useEffect(() => {
    void refetch();
  }, [enabled]);

  return { feedback, loading, refetch, setFeedback };
}
