import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import {
  createFeedback,
  FEEDBACK_TYPE_LABELS,
  type FeedbackType,
} from "@/domains/feedback/feedback.hooks";

interface FeedbackModalProps {
  userId: string;
  onClose: () => void;
}

const feedbackTypes = Object.entries(FEEDBACK_TYPE_LABELS) as [FeedbackType, string][];

const FeedbackModal = ({ userId, onClose }: FeedbackModalProps) => {
  const [type, setType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = message.trim();

    if (!trimmed) {
      toast.error("Опишите, что случилось");
      return;
    }

    setSubmitting(true);
    const { error } = await createFeedback(userId, type, trimmed);
    setSubmitting(false);

    if (error) {
      toast.error("Не удалось отправить обратную связь");
      return;
    }

    toast.success("Спасибо! Мы получили сообщение");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-background/78 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex min-h-screen items-end justify-center px-0 py-0 sm:items-center sm:px-4 sm:py-6">
        <div
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
          className="flex h-auto max-h-[96dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[1.5rem] border border-white/10 bg-[#171a20] shadow-[0_22px_70px_rgba(0,0,0,0.42)] sm:max-h-[88vh] sm:rounded-2xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-white/5 px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-foreground">Обратная связь</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Ошибка, идея или жалоба — коротко и по делу.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-1.5 text-muted-foreground transition-colors hover:border-white/15 hover:bg-white/10 hover:text-foreground"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-foreground/85">
                  Тип
                </span>
                <select
                  className="djhub-select w-full text-sm"
                  value={type}
                  onChange={(event) => setType(event.target.value as FeedbackType)}
                >
                  {feedbackTypes.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-foreground/85">
                  Сообщение
                </span>
                <textarea
                  className="min-h-32 w-full resize-none rounded-xl border border-white/10 bg-[#0f1115] px-3.5 py-3 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/45 focus:ring-2 focus:ring-primary/10"
                  value={message}
                  maxLength={1000}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Что нужно исправить или улучшить?"
                />
                <p className="mt-1.5 text-right text-[10px] text-muted-foreground/75">
                  {message.length}/1000
                </p>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-white/5 bg-[#15181e] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-white/10 bg-transparent px-4 text-xs font-semibold text-muted-foreground transition-colors hover:border-white/15 hover:bg-white/5 hover:text-foreground"
            >
              Отмена
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-glow h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? "Отправляем..." : "Отправить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeedbackModal;
