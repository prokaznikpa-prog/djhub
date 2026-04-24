import { Component, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  useApplicationsForDj, useApplicationsForVenue,
  updateApplicationStatus,
  hideApplicationForDj, hideApplicationForVenue, restoreApplicationForDj, restoreApplicationForVenue,
} from "@/domains/applications/applications.hooks";
import {
  useInvitationsForDj, useInvitationsForVenue,
  updateInvitationStatus,
} from "@/domains/invitations/invitations.hooks";
import { updateBookingStatus } from "@/domains/bookings/bookings.hooks";
import { canUserLeaveBookingReview, createBookingReview, getReviewForBooking } from "@/domains/reviews/reviews.hooks";
import { createNotification } from "@/domains/notifications/notifications.hooks";
import { useChatMessages, useChatThreadPreviews, useChatThreads } from "@/hooks/useChatFlow";
import { hideChatThreadForParticipant, resolveOtherParticipantLabel, resolveSenderLabel, sendChatMessage } from "@/lib/chatFlow";
import { supabase } from "@/integrations/supabase/client";
import { getGigTypeLabel } from "@/lib/gigs";
import {
  canDjCancelApplication,
  canVenueAcceptApplication,
  canVenueRejectApplication,
  getApplicationStatusClass,
  getApplicationStatusLabel,
  type ApplicationVisibility,
} from "@/lib/applications";
import { Check, X as XIcon, Send, Mail, Inbox as InboxIcon, MessageCircle, EyeOff, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import type { ChatMessage, ChatParticipant, ChatThread } from "@/lib/chat";
import {
  canCompleteBooking,
  canCancelBooking,
  canConfirmBooking,
  normalizeBookingStatus,
  parseBookingEventDateTime,
  type BookingStatus,
} from "@/lib/bookings";
import { toast } from "sonner";

const ApplicationVisibilityTabs = memo(({ value, onChange }: { value: ApplicationVisibility; onChange: (value: ApplicationVisibility) => void }) => (
  <div className="premium-surface inline-flex p-0.5">
    {(["active", "hidden"] as const).map((option) => (
      <button
        key={option}
        type="button"
        onClick={() => onChange(option)}
        className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
          value === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {option === "active" ? "Активные" : "Скрытые"}
      </button>
    ))}
  </div>
));

const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  pending: "Ожидает подтверждения",
  confirmed: "Подтверждена",
  completed: "Завершена",
  cancelled: "Отменена",
};
const BOOKING_ACTION_LABEL: Partial<Record<BookingStatus, string>> = {
  confirmed: "Подтвердить",
  completed: "Завершить бронь",
  cancelled: "Отменить",
};
const BOOKING_ACTION_PENDING_LABEL: Partial<Record<BookingStatus, string>> = {
  confirmed: "Подтверждаем...",
  completed: "Завершаем...",
  cancelled: "Отменяем...",
};
const notifyInBackground = (task: Promise<unknown>) => {
  void task.catch((error) => {
    console.error("Background notification failed", error);
  });
};

const formatThreadDate = (value?: string | null) => {
  if (!value) return "";
  const parsed = parseBookingEventDateTime(value, null);
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString("ru-RU") : value;
};

const formatThreadTime = (dateValue?: string | null, timeValue?: string | null) => {
  const parsed = parseBookingEventDateTime(dateValue, timeValue);
  if (!parsed) return timeValue ?? "";
  return parsed.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
};

const getThreadTimestamp = (value?: string | null, timeValue?: string | null) => {
  const parsed = parseBookingEventDateTime(value, timeValue)?.getTime() ?? 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const hydrateThreadDisplay = (
  thread: ChatThread,
  metadata: Pick<ChatThread, "djName" | "venueName" | "gigTitle">,
): ChatThread => ({
  ...thread,
  djName: thread.djName ?? metadata.djName ?? null,
  venueName: thread.venueName ?? metadata.venueName ?? null,
  gigTitle: thread.gigTitle ?? metadata.gigTitle ?? null,
});

class InboxSectionBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Inbox section render failed", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="premium-surface p-5 text-sm text-muted-foreground">Входящие остались доступны, но один из блоков не смог отрисоваться. Обновите страницу или попробуйте действие ещё раз.</section>
      );
    }

    return this.props.children;
  }
}

class ChatPanelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Chat panel render failed", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="premium-surface min-w-0 p-5 text-sm text-muted-foreground">Не удалось открыть этот диалог. Список чатов остался доступен, попробуйте выбрать другой чат или обновить страницу.</div>
      );
    }

    return this.props.children;
  }
}

const QUICK_REPLIES: Record<ChatParticipant["kind"], string[]> = {
  dj: ["Свободен в эту дату", "Какие условия?", "Готов сыграть"],
  venue: ["Какая цена?", "На сколько часов?", "Когда можете?"],
};
const BookingStatusControls = memo(({
  thread,
  participant,
  onUpdate,
  onRefresh,
}: {
  thread: ChatThread;
  participant: ChatParticipant;
  onUpdate: (threadId: string, updates: Partial<ChatThread>) => void;
  onRefresh: (threadId: string) => Promise<ChatThread | null> | ChatThread | null;
}) => {
  const [updating, setUpdating] = useState<BookingStatus | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewExists, setReviewExists] = useState(false);
  const [reviewChecking, setReviewChecking] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const status = normalizeBookingStatus(thread.bookingStatus);
  const isParticipant = thread.djId === participant.profileId || thread.venueId === participant.profileId;
  const bookingForRules = {
    status,
    eventDate: thread.bookingEventDate,
    eventTime: thread.bookingEventTime,
    postType: thread.bookingPostType,
  };
  const bookingForReview = { status, dj_id: thread.djId, venue_id: thread.venueId };
  const canReview = canUserLeaveBookingReview(bookingForReview, participant.profileId);
  const reviewTargetId = participant.profileId === thread.djId ? thread.venueId : thread.djId;
  const canConfirmAsVenue = participant.kind === "venue" && participant.profileId === thread.venueId && canConfirmBooking(bookingForRules);
  const canCompleteAsVenue = participant.kind === "venue" && participant.profileId === thread.venueId && canCompleteBooking(bookingForRules);
  const actions: BookingStatus[] = [];

  useEffect(() => {
    let isMounted = true;
    if (!thread.bookingId || !canReview) {
      setReviewExists(false);
      setReviewOpen(false);
      setReviewChecking(false);
      return;
    }

    setReviewChecking(true);
    getReviewForBooking(thread.bookingId, participant.profileId).then(({ data, error }) => {
      if (!isMounted) return;
      if (error) toast.error(error.message);
      setReviewExists(!!data);
      setReviewChecking(false);
    });

    return () => {
      isMounted = false;
    };
  }, [thread.bookingId, participant.profileId, canReview]);

  if (!thread.bookingId || !isParticipant) return null;
  if (canConfirmAsVenue) actions.push("confirmed");
  if (canCompleteAsVenue) actions.push("completed");
  if (canCancelBooking(bookingForRules)) actions.push("cancelled");

  const handleStatus = async (nextStatus: BookingStatus) => {
    if (updating) return;
    setUpdating(nextStatus);
    const { data, error } = await updateBookingStatus(thread.bookingId!, nextStatus);
    setUpdating(null);

    if (error || !data) {
      toast.error(error?.message ?? "Не удалось обновить бронь");
      return;
    }

    onUpdate(thread.id, {
      bookingId: data.id,
      bookingStatus: data.status,
      bookingCompletedAt: data.completed_at ?? thread.bookingCompletedAt ?? null,
      updatedAt: new Date().toISOString(),
    });
    void onRefresh(thread.id);
    toast.success(nextStatus === "completed" ? "Бронь завершена. Не забудьте оставить отзыв" : "Статус брони обновлён");
  };

  const handleReview = async () => {
    if (!thread.bookingId || !reviewTargetId || reviewSubmitting) return;
    setReviewSubmitting(true);
    const { error } = await createBookingReview({
      bookingId: thread.bookingId,
      reviewerId: participant.profileId,
      targetId: reviewTargetId,
      rating: reviewRating,
      comment: reviewComment,
    });
    setReviewSubmitting(false);

    if (error) {
      toast.error(error.message || "Не удалось сохранить отзыв");
      if (error.message.includes("СѓР¶Рµ РѕСЃС‚Р°РІРёР»Рё")) {
        setReviewExists(true);
        setReviewOpen(false);
      }
      return;
    }

    setReviewExists(true);
    setReviewOpen(false);
    setReviewComment("");
    toast.success("Отзыв сохранён");
  };

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
          {BOOKING_STATUS_LABEL[status]}
        </span>
        {thread.bookingEventDate && (
          <span className="text-[10px] text-muted-foreground">
            {formatThreadDate(thread.bookingEventDate)}{thread.bookingEventTime ? ` в ${formatThreadTime(thread.bookingEventDate, thread.bookingEventTime)}` : ""}
          </span>
        )}
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => handleStatus(action)}
            disabled={!!updating}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 disabled:opacity-50"
          >
            {updating === action ? BOOKING_ACTION_PENDING_LABEL[action] : BOOKING_ACTION_LABEL[action]}
          </button>
        ))}
        {canReview && !reviewChecking && !reviewExists && !reviewOpen && (
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            disabled={reviewChecking}
            className="rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
          >
            Оставить отзыв
          </button>
        )}
        {canReview && reviewExists && (
          <span className="text-[10px] font-medium text-muted-foreground">Отзыв оставлен</span>
        )}
      </div>
      {canReview && reviewOpen && (
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={reviewRating}
            onChange={(event) => setReviewRating(Number(event.target.value))}
            className="djhub-select h-7 px-2 pr-7 text-[10px]"
          >
            {[5, 4, 3, 2, 1].map((rating) => (
              <option key={rating} value={rating}>{rating}</option>
            ))}
          </select>
          <input
            value={reviewComment}
            onChange={(event) => setReviewComment(event.target.value)}
            maxLength={500}
            placeholder="Комментарий"
            className="premium-input min-w-0 flex-1 px-2 py-1 text-[10px]"
          />
          <button
            type="button"
            onClick={handleReview}
            disabled={reviewSubmitting}
            className="rounded-lg bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {reviewSubmitting ? "..." : "Сохранить"}
          </button>
        </div>
      )}
    </div>
  );
});

const InboxPage = () => {
  const { user, djProfile, venueProfile, profilesLoading } = useAuth();
  const [focusThreadId, setFocusThreadId] = useState<string | null>(null);
  const chatParticipant = useMemo<ChatParticipant | null>(() => {
    if (djProfile) return { profileId: djProfile.id, kind: "dj" };
    if (venueProfile) return { profileId: venueProfile.id, kind: "venue" };
    return null;
  }, [djProfile?.id, venueProfile?.id]);
  const chatThreads = useChatThreads(chatParticipant);
  const handleChatThreadReady = useCallback((thread: ChatThread) => {
    if (!thread?.id) return;
    chatThreads.addThread(thread);
    setFocusThreadId(thread.id);
    void chatThreads.refreshThread(thread.id);
  }, [chatThreads.addThread, chatThreads.refreshThread]);

  if (!user) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Войдите, чтобы видеть входящие</p>
          <Link to="/login" className="text-sm text-primary hover:underline">Войти</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-12">
      <div className="container mx-auto max-w-5xl px-4 space-y-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <InboxIcon className="h-5 w-5 text-primary" /> Входящие
        </h1>
        <InboxSectionBoundary>
          {djProfile && <DjInbox djProfile={djProfile} userId={user.id} onChatThreadReady={handleChatThreadReady} />}
          {venueProfile && <VenueInbox venueProfile={venueProfile} userId={user.id} onChatThreadReady={handleChatThreadReady} />}
        </InboxSectionBoundary>
        {chatParticipant && (
          <InboxSectionBoundary>
            <BookingChat
              participant={chatParticipant}
              threads={chatThreads.threads}
              loading={chatThreads.loading}
              focusThreadId={focusThreadId}
              onFocusedThread={() => setFocusThreadId(null)}
              removeThreadLocal={chatThreads.removeThreadLocal}
              updateThreadLocal={chatThreads.updateThreadLocal}
              refreshThread={chatThreads.refreshThread}
            />
          </InboxSectionBoundary>
        )}
        {!djProfile && !venueProfile && profilesLoading && (
          <p className="text-sm text-muted-foreground text-center py-8">Загружаем профиль...</p>
        )}
        {!djProfile && !venueProfile && !profilesLoading && (
          <p className="text-sm text-muted-foreground text-center py-8">Создайте профиль DJ или заведения, чтобы видеть входящие</p>
        )}
      </div>
    </div>
  );
};

const BookingChat = memo(({
  participant,
  threads,
  loading,
  focusThreadId,
  onFocusedThread,
  removeThreadLocal,
  updateThreadLocal,
  refreshThread,
}: {
  participant: ChatParticipant;
  threads: ChatThread[];
  loading: boolean;
  focusThreadId: string | null;
  onFocusedThread: () => void;
  removeThreadLocal: (threadId: string) => void;
  updateThreadLocal: (threadId: string, updates: Partial<ChatThread>) => void;
  refreshThread: (threadId: string) => Promise<ChatThread | null> | ChatThread | null;
}) => {
  const { previews, updatePreview } = useChatThreadPreviews(threads);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => typeof window === "undefined" ? true : window.innerWidth >= 768);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(() => new Set());
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const previousListScrollTop = useRef(0);
  const previousPreviewIds = useRef<Record<string, string>>({});
  const visibleThreads = useMemo(() => {
    const byKey = new Map<string, ChatThread>();
    threads.filter((thread) => thread?.id).forEach((thread) => {
      byKey.set(thread.bookingId ?? thread.id, thread);
    });
    return Array.from(byKey.values()).sort((a, b) => {
      const aTime = getThreadTimestamp(previews[a.id]?.createdAt ?? a.updatedAt);
      const bTime = getThreadTimestamp(previews[b.id]?.createdAt ?? b.updatedAt);
      return bTime - aTime;
    });
  }, [threads, previews]);
  const selectedThread = visibleThreads.find((thread) => thread.id === selectedId) ?? visibleThreads[0] ?? null;

  useEffect(() => {
    if (!selectedId && visibleThreads[0]) setSelectedId(visibleThreads[0].id);
    if (selectedId && !visibleThreads.some((thread) => thread.id === selectedId)) {
      setSelectedId(visibleThreads[0]?.id ?? null);
    }
  }, [visibleThreads, selectedId]);

  useEffect(() => {
    if (!focusThreadId) return;
    const targetThread = visibleThreads.find((thread) => thread.id === focusThreadId);
    if (!targetThread) return;

    setSelectedId(targetThread.id);
    setPanelOpen(true);
    setCollapsed(false);
    setUnreadIds((current) => {
      if (!current.has(targetThread.id)) return current;
      const next = new Set(current);
      next.delete(targetThread.id);
      return next;
    });
    onFocusedThread();
  }, [focusThreadId, visibleThreads, onFocusedThread]);

  useEffect(() => {
    const previous = previousPreviewIds.current;
    const next: Record<string, string> = {};
    visibleThreads.forEach((thread) => {
      const preview = previews[thread.id];
      if (preview) {
        next[thread.id] = preview.id;
        if (previous[thread.id] && previous[thread.id] !== preview.id && preview.senderId !== participant.profileId && thread.id !== selectedId) {
          setUnreadIds((current) => new Set(current).add(thread.id));
        }
      }
    });
    previousPreviewIds.current = next;
  }, [previews, visibleThreads, participant.profileId, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    setUnreadIds((current) => {
      if (!current.has(selectedId)) return current;
      const next = new Set(current);
      next.delete(selectedId);
      return next;
    });
  }, [selectedId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setPanelOpen(true);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useLayoutEffect(() => {
    if (!listScrollRef.current) return;
    listScrollRef.current.scrollTop = previousListScrollTop.current;
  }, [visibleThreads]);

  const handleHideThread = useCallback(async (thread: ChatThread) => {
    const { error } = await hideChatThreadForParticipant(thread, participant);
    if (error) {
      toast.error("Не удалось скрыть чат из входящих");
      return;
    }

    removeThreadLocal(thread.id);
    updatePreview(thread.id, null);
    setUnreadIds((current) => {
      if (!current.has(thread.id)) return current;
      const next = new Set(current);
      next.delete(thread.id);
      return next;
    });
    toast.success("Чат скрыт");
  }, [participant, removeThreadLocal, updatePreview]);

  return (
    <section className="premium-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" /> Чаты по бронированию
          </h2>
          <p className="text-[10px] text-muted-foreground">Выбирайте чат с DJ и обсуждайте детали напрямую</p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
          title={collapsed ? "Развернуть" : "Свернуть"}
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>
      {collapsed ? null : (
      <div className="p-3">
      {loading ? (
        <p className="text-sm text-muted-foreground">Загружаем чаты...</p>
      ) : visibleThreads.length === 0 ? (
        <p className="text-sm text-muted-foreground">У вас пока нет активных чатов</p>
      ) : (
        <div className={`grid gap-3 ${panelOpen ? "md:grid-cols-[280px_minmax(0,1fr)]" : ""}`}>
          <div className={`premium-surface overflow-hidden ${selectedThread && panelOpen ? "hidden md:block" : "block"}`}>
            <div className="border-b border-white/10 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Диалоги</p>
            </div>
            <div
              ref={listScrollRef}
              onScroll={(event) => { previousListScrollTop.current = event.currentTarget.scrollTop; }}
              className="max-h-[38dvh] space-y-1 overflow-y-auto p-2 md:max-h-[452px] [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent"
            >
              {visibleThreads.map((thread) => {
                const preview = previews[thread.id];
                const participantName = resolveOtherParticipantLabel(thread, participant);
                const isSelected = selectedThread?.id === thread.id && panelOpen;
                const isUnread = unreadIds.has(thread.id);
                const previewText = preview?.text ?? "Напишите сообщение, чтобы начать диалог";

                return (
                  <div
                    key={thread.id}
                    className={`flex items-stretch rounded-xl border transition-colors ${
                      isSelected
                        ? "border-primary/50 bg-primary/10 shadow-sm shadow-primary/10"
                        : "border-transparent bg-transparent hover:border-white/10 hover:bg-white/5"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(thread.id);
                        setPanelOpen(true);
                        setUnreadIds((current) => {
                          if (!current.has(thread.id)) return current;
                          const next = new Set(current);
                          next.delete(thread.id);
                          return next;
                        });
                      }}
                      className="min-w-0 flex-1 px-3 py-2.5 text-left"
                    >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                        <span className="min-w-0 truncate text-sm font-semibold text-foreground">{participantName}</span>
                      </span>
                      <span className="shrink-0 text-[9px] text-muted-foreground/70">
                        {formatThreadTime(preview?.createdAt ?? thread.updatedAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] font-medium text-primary/90">
                      {thread.gigTitle ?? "Публикация"}{thread.bookingEventDate ? ` · ${formatThreadDate(thread.bookingEventDate)}` : ""}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{previewText}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleHideThread(thread)}
                      className="shrink-0 rounded-lg px-2 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                      title="Скрыть чат из входящих"
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          {selectedThread && panelOpen && (
            <div className="min-w-0">
              <ChatPanelBoundary key={selectedThread.id}>
                <ChatMessages
                  thread={selectedThread}
                  participant={participant}
                  onClose={() => setPanelOpen(false)}
                  currentPreview={previews[selectedThread.id]}
                  onPreview={updatePreview}
                  onBookingUpdate={updateThreadLocal}
                  onRefreshThread={refreshThread}
                />
              </ChatPanelBoundary>
            </div>
          )}
        </div>
      )}
      </div>
      )}
    </section>
  );
});

const ChatMessages = memo(({
  thread,
  participant,
  onClose,
  currentPreview,
  onPreview,
  onBookingUpdate,
  onRefreshThread,
}: {
  thread: ChatThread;
  participant: ChatParticipant;
  onClose: () => void;
  currentPreview?: ChatMessage;
  onPreview: (threadId: string, message: ChatMessage | null) => void;
  onBookingUpdate: (threadId: string, updates: Partial<ChatThread>) => void;
  onRefreshThread: (threadId: string) => Promise<ChatThread | null> | ChatThread | null;
}) => {
  const { user } = useAuth();
  const { messages, loading, appendMessage, replaceMessage, removeMessage } = useChatMessages(thread, participant, user?.id ?? null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const stickToBottomRef = useRef(true);
  const previousThreadId = useRef<string | null>(null);
  const visibleThreadIdRef = useRef<string | null>(null);
  const quickReplies = participant.kind === "venue"
    ? [...QUICK_REPLIES.venue, "Давайте обсудим детали мероприятия"]
    : QUICK_REPLIES[participant.kind];
  const [visibleMessages, setVisibleMessages] = useState<ChatMessage[]>([]);
  const hiddenMessageCount = Math.max(0, messages.length - visibleMessages.length);
  const lastMessage = messages[messages.length - 1];
  const showResponseSpeedHint = !!lastMessage && Date.now() - new Date(lastMessage.createdAt).getTime() > 3 * 60 * 60 * 1000;

  useEffect(() => {
    setVisibleMessages((current) => {
      if (visibleThreadIdRef.current !== thread.id) {
        visibleThreadIdRef.current = thread.id;
        return messages.slice(-30);
      }

      if (messages.length === 0) return [];
      if (current.length === 0) return messages.slice(-30);

      const allIds = new Set(messages.map((message) => message.id));
      const currentIds = new Set(current.map((message) => message.id));
      const hasReplacedOrRemovedMessage = current.some((message) => !allIds.has(message.id));

      if (hasReplacedOrRemovedMessage) {
        return messages.slice(-Math.min(messages.length, Math.max(30, current.length)));
      }

      const newMessages = messages.filter((message) => !currentIds.has(message.id));
      return newMessages.length > 0 ? [...current, ...newMessages] : current;
    });
  }, [messages, thread.id]);

  const showOlderMessages = useCallback(() => {
    setVisibleMessages((current) => {
      const nextCount = Math.min(messages.length, current.length + 30);
      return messages.slice(-nextCount);
    });
  }, [messages]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const threadChanged = previousThreadId.current !== thread.id;
    previousThreadId.current = thread.id;
    if (threadChanged || stickToBottomRef.current) {
      node.scrollTo({ top: node.scrollHeight, behavior: threadChanged || visibleMessages.length <= 1 ? "auto" : "smooth" });
    }
  }, [visibleMessages.length, thread.id]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [thread.id]);

  const handleSend = useCallback(async () => {
    if (sending) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      threadId: thread.id,
      senderId: participant.profileId,
      text: trimmed,
      createdAt: new Date().toISOString(),
    };

    appendMessage(optimisticMessage);
    onPreview(thread.id, optimisticMessage);
    setText("");
    setSending(true);
    const { data, error } = await sendChatMessage(thread, participant, trimmed);
    setSending(false);

    if (error) {
      removeMessage(tempId);
      onPreview(thread.id, currentPreview ?? null);
      setText(trimmed);
      toast.error(error.message);
      return;
    }

    if (data) {
      replaceMessage(tempId, data);
      onPreview(thread.id, data);
    }
  }, [sending, text, thread, participant, appendMessage, onPreview, removeMessage, currentPreview, replaceMessage]);

  return (
    <div className="premium-surface min-w-0 overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-white/5 px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-primary/90">Чат по бронированию</p>
          <h3 className="mt-0.5 truncate text-sm font-semibold text-foreground">{thread.gigTitle ?? "Публикация"}</h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {thread.djName || "DJ..."} &rarr; {thread.venueName || "Заведение..."}
          </p>
          <BookingStatusControls
            thread={thread}
            participant={participant}
            onUpdate={onBookingUpdate}
            onRefresh={onRefreshThread}
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
          title="Закрыть чат"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const node = event.currentTarget;
          if (node.scrollTop < 24) {
            showOlderMessages();
          }
          stickToBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
        }}
        className="max-h-[45dvh] min-h-[16rem] overflow-y-auto bg-black/10 px-3 py-3 sm:max-h-[392px] sm:min-h-64 sm:px-4 sm:py-4 [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent"
      >
        {loading ? (
          <p className="text-xs text-muted-foreground">Загружаем сообщения...</p>
        ) : messages.length === 0 ? (
          <div className="premium-surface p-4 text-center">
            <p className="text-sm font-medium text-foreground">Диалог создан и готов к обсуждению деталей</p>
            <p className="text-sm font-medium text-foreground">Напишите первое сообщение собеседнику</p>
            <p className="mt-1 text-xs text-muted-foreground">Дата, время, условия и все подробности удобно согласовать прямо в чате.</p>
          </div>
        ) : (
          <div className="space-y-1 pr-1">
          {hiddenMessageCount > 0 && (
            <button
              type="button"
              onClick={showOlderMessages}
              className="mx-auto mb-3 block rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Показать более ранние сообщения
            </button>
          )}
          {visibleMessages.map((message, index) => {
            const isMine = message.senderId === participant.profileId;
            const previous = visibleMessages[index - 1];
            const next = visibleMessages[index + 1];
            const startsGroup = !previous || previous.senderId !== message.senderId;
            const endsGroup = !next || next.senderId !== message.senderId;
            const senderName = resolveSenderLabel(thread, message.senderId);

            return (
              <div key={message.id} className={`flex ${isMine ? "justify-end" : "justify-start"} ${startsGroup ? "mt-3" : "mt-1"}`}>
                <div className={`max-w-[84%] ${isMine ? "items-end" : "items-start"}`}>
                  {startsGroup && !isMine && (
                    <p className="mb-1 px-1 text-[10px] font-medium text-muted-foreground">{senderName}</p>
                  )}
                  <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                    isMine
                      ? `${startsGroup ? "rounded-tr-2xl" : "rounded-tr-md"} ${endsGroup ? "rounded-br-md" : "rounded-br-2xl"} bg-primary text-primary-foreground`
                      : `${startsGroup ? "rounded-tl-2xl" : "rounded-tl-md"} ${endsGroup ? "rounded-bl-md" : "rounded-bl-2xl"} border border-white/10 bg-white/10 text-foreground backdrop-blur-xl`
                  }`}>
                  <p className="whitespace-pre-wrap break-words">{message.text}</p>
                  {endsGroup && (
                    <div className={`mt-1.5 flex items-center justify-end gap-1 text-[9px] leading-none ${isMine ? "text-primary-foreground/65" : "text-muted-foreground/80"}`}>
                      <span>{formatThreadTime(message.createdAt)}</span>
                      {isMine && (
                        message.readAt ? (
                          <span className="inline-flex items-center">
                            <Check className="h-3 w-3" strokeWidth={2.25} />
                            <Check className="-ml-1.5 h-3 w-3" strokeWidth={2.25} />
                          </span>
                        ) : (
                          <Check className="h-3 w-3" strokeWidth={2.25} />
                        )
                      )}
                    </div>
                  )}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        )}
      </div>
      <div className="border-t border-white/10 bg-white/5 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {quickReplies.map((reply) => (
            <button
              key={reply}
              type="button"
              onClick={() => {
                setText(reply);
                inputRef.current?.focus();
              }}
              className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] font-medium text-primary transition-colors hover:bg-primary/10"
            >
              {reply}
            </button>
          ))}
        </div>
        {showResponseSpeedHint && (
          <p className="mb-2 text-[10px] font-medium text-primary/80">Подсказки рядом, текст не отправится сам</p>
        )}
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          className="premium-input min-w-0 flex-1"
          value={text}
          maxLength={1000}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSend();
            }
          }}
          placeholder="Напишите сообщение..."
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !text.trim()}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
        >
          <Send className="h-3.5 w-3.5" />
          Отправить
        </button>
      </div>
    </div>
    </div>
  );
});

const DjInbox = ({ djProfile, userId, onChatThreadReady }: { djProfile: any; userId: string; onChatThreadReady: (thread: ChatThread) => void }) => {
  const { invites, updateLocal: updateInviteLocal } = useInvitationsForDj(djProfile.id);
  const [appVisibility, setAppVisibility] = useState<ApplicationVisibility>("active");
  const { apps, loading: appsLoading, hideLocal: hideDjAppLocal, updateStatusLocal: updateDjAppStatusLocal } = useApplicationsForDj(djProfile.id, appVisibility);
  const [pendingInviteAction, setPendingInviteAction] = useState<string | null>(null);

  const handleAccept = async (inv: any) => {
    if (pendingInviteAction) return;
    setPendingInviteAction(`accept:${inv.id}`);
    const { error, chatThread } = await updateInvitationStatus(inv.id, "accepted");
    if (error) {
      setPendingInviteAction(null);
      toast.error(error.message);
      return;
    }
    updateInviteLocal(inv.id, "accepted");
    if (chatThread) onChatThreadReady(hydrateThreadDisplay(chatThread, { djName: djProfile.name ?? null, venueName: inv.venue_profiles?.name ?? null, gigTitle: inv.venue_posts?.title ?? null }));
    toast.success("Чат открыт");
    setPendingInviteAction(null);
    if (inv.venue_profiles?.user_id) {
      notifyInBackground(createNotification(inv.venue_profiles.user_id, "status_update", `${djProfile.name} принял приглашение на "${inv.venue_posts?.title ?? ""}"`, inv.id));
    }
  };

  const handleReject = async (inv: any) => {
    if (pendingInviteAction) return;
    setPendingInviteAction(`reject:${inv.id}`);
    const { error } = await updateInvitationStatus(inv.id, "rejected");
    if (error) {
      setPendingInviteAction(null);
      toast.error(error.message);
      return;
    }
    updateInviteLocal(inv.id, "rejected");
    toast.success("Приглашение отклонено");
    setPendingInviteAction(null);
    if (inv.venue_profiles?.user_id) {
      notifyInBackground(createNotification(inv.venue_profiles.user_id, "status_update", `${djProfile.name} отклонил приглашение на "${inv.venue_posts?.title ?? ""}"`, inv.id));
    }
  };

  const handleCancelApp = async (app: any) => {
    const { error } = await updateApplicationStatus(app.id, "cancelled");
    if (error) {
      toast.error("Не удалось отменить отклик");
      return;
    }
    updateDjAppStatusLocal(app.id, "cancelled");
    toast.success("Отклик отменён");
  };

  const handleHideApp = async (app: any) => {
    const { error } = await hideApplicationForDj(app.id);
    if (error) {
      toast.error("Не удалось скрыть отклик");
      return;
    }
    hideDjAppLocal(app.id);
    toast.success("Отклик скрыт");
  };

  const handleRestoreApp = async (app: any) => {
    const { error } = await restoreApplicationForDj(app.id);
    if (error) {
      toast.error("Не удалось вернуть отклик");
      return;
    }
    hideDjAppLocal(app.id);
    toast.success("Отклик возвращён");
  };

  return (
    <>
      {/* Invitations */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> Приглашения</h2>
        {invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет приглашений</p>
        ) : (
          <div className="max-h-[30vh] space-y-1 overflow-y-auto pr-1 sm:max-h-[220px] [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent">
            {invites.map((inv) => (
              <div key={inv.id} className="premium-row flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <span className="text-sm font-semibold">{inv.venue_profiles?.name ?? "Заведение"}</span>
                  <div className="text-xs text-muted-foreground">
                    {inv.venue_posts?.title ?? ""} В· {getGigTypeLabel(inv.venue_posts?.post_type)}
                  </div>
                  {inv.message && <p className="text-[10px] text-muted-foreground/70 mt-0.5">"{inv.message}"</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[10px] font-mono ${getApplicationStatusClass(inv.status)}`}>{getApplicationStatusLabel(inv.status)}</span>
                  {inv.status === "new" && (
                    <>
                      <button disabled={pendingInviteAction === `accept:${inv.id}` || pendingInviteAction === `reject:${inv.id}`} onClick={() => handleAccept(inv)} className="rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-50">{pendingInviteAction === `accept:${inv.id}` ? "Открываем..." : "Связаться"}</button>
                      <button disabled={pendingInviteAction === `accept:${inv.id}` || pendingInviteAction === `reject:${inv.id}`} onClick={() => handleReject(inv)} className="p-1 rounded hover:bg-destructive/10 transition-colors disabled:opacity-50" title="Отклонить">
                        <XIcon className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* My applications */}
      <section className="space-y-3 min-h-[112px]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold flex items-center gap-2"><Send className="h-4 w-4 text-primary" /> Мои отклики</h2>
          <ApplicationVisibilityTabs value={appVisibility} onChange={setAppVisibility} />
        </div>
        {appsLoading ? (
          <p className="text-sm text-muted-foreground">Загрузка откликов...</p>
        ) : apps.length === 0 ? (
          <p className="text-sm text-muted-foreground">{appVisibility === "active" ? "Пока нет откликов" : "Скрытых откликов нет"}</p>
        ) : (
          <div className="max-h-[34vh] space-y-1 overflow-y-auto pr-1 sm:max-h-[260px] [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent">
            {apps.map((a) => (
              <div key={a.id} className="premium-row flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <span className="text-sm font-semibold">{a.venue_posts?.title ?? "Публикация"}</span>
                  <div className="text-xs text-muted-foreground">
                    {(a.venue_posts as any)?.venue_profiles?.name ?? ""} В· {getGigTypeLabel(a.venue_posts?.post_type)} В· {a.venue_posts?.event_date ? new Date(a.venue_posts.event_date).toLocaleDateString("ru-RU") : new Date(a.created_at).toLocaleDateString("ru-RU")}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-mono ${getApplicationStatusClass(a.status)}`}>{getApplicationStatusLabel(a.status)}</span>
                  {appVisibility === "active" && canDjCancelApplication(a) && (
                    <button onClick={() => handleCancelApp(a)} className="p-1 rounded hover:bg-destructive/10 transition-colors" title="Отменить">
                      <XIcon className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  )}
                  {appVisibility === "active" ? (
                    <button onClick={() => handleHideApp(a)} className="p-1 rounded hover:bg-white/10 transition-colors" title="Скрыть">
                      <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  ) : (
                    <button onClick={() => handleRestoreApp(a)} className="p-1 rounded hover:bg-primary/10 transition-colors" title="Вернуть">
                      <RotateCcw className="h-3.5 w-3.5 text-primary" />
                    </button>
                  )}
                  {a.venue_posts && <Link to={`/post/${a.post_id}`} className="text-[10px] text-primary hover:underline">Профиль</Link>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
};

const VenueInbox = ({
  venueProfile,
  userId,
  onChatThreadReady,
}: {
  venueProfile: any;
  userId: string;
  onChatThreadReady: (thread: ChatThread) => void;
}) => {
  const [appVisibility, setAppVisibility] = useState<ApplicationVisibility>("active");
  const { apps, loading: appsLoading, hideLocal: hideVenueAppLocal, updateStatusLocal: updateVenueAppStatusLocal } = useApplicationsForVenue(venueProfile.id, appVisibility);
  const { invites, updateLocal: updateVenueInviteLocal } = useInvitationsForVenue(venueProfile.id);
  const [pendingAppAction, setPendingAppAction] = useState<string | null>(null);

  const handleAcceptApp = async (app: any) => {
    if (pendingAppAction) return;
    setPendingAppAction(`accept:${app.id}`);
    const { error, chatThread } = await updateApplicationStatus(app.id, "accepted");
    if (error) {
      setPendingAppAction(null);
      toast.error("Не удалось открыть чат");
      return;
    }
    updateVenueAppStatusLocal(app.id, "accepted");
    if (chatThread) onChatThreadReady(hydrateThreadDisplay(chatThread, { djName: app.dj_profiles?.name ?? null, venueName: venueProfile.name ?? null, gigTitle: app.venue_posts?.title ?? null }));
    toast.success("Чат открыт");
    setPendingAppAction(null);
    if (app.dj_profiles?.user_id) {
      notifyInBackground(createNotification(app.dj_profiles.user_id, "status_update", `Ваш отклик на "${app.venue_posts?.title ?? ""}" принят`, app.id));
    }
  };

  const handleRejectApp = async (app: any) => {
    if (pendingAppAction) return;
    setPendingAppAction(`reject:${app.id}`);
    const { error } = await updateApplicationStatus(app.id, "rejected");
    if (error) {
      setPendingAppAction(null);
      toast.error("Не удалось отклонить отклик");
      return;
    }
    updateVenueAppStatusLocal(app.id, "rejected");
    toast.success("Отклик отклонён");
    setPendingAppAction(null);
    if (app.dj_profiles?.user_id) {
      notifyInBackground(createNotification(app.dj_profiles.user_id, "status_update", `Ваш отклик на "${app.venue_posts?.title ?? ""}" отклонён`, app.id));
    }
  };

  const handleHideApp = async (app: any) => {
    const { error } = await hideApplicationForVenue(app.id);
    if (error) {
      toast.error("Не удалось скрыть отклик");
      return;
    }
    hideVenueAppLocal(app.id);
    toast.success("Отклик скрыт");
  };

  const handleRestoreApp = async (app: any) => {
    const { error } = await restoreApplicationForVenue(app.id);
    if (error) {
      toast.error("Не удалось вернуть отклик");
      return;
    }
    hideVenueAppLocal(app.id);
    toast.success("Отклик возвращён");
  };

  const handleCancelInvite = async (inv: any) => {
    const { error } = await updateInvitationStatus(inv.id, "cancelled");
    if (error) {
      toast.error(error.message);
      return;
    }
    updateVenueInviteLocal(inv.id, "cancelled");
    toast.success("Приглашение отменено");
  };

  return (
    <>
      {/* Applications on my posts */}
      <section className="space-y-3 min-h-[112px]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold flex items-center gap-2"><Send className="h-4 w-4 text-primary" /> Отклики на мои публикации</h2>
          <ApplicationVisibilityTabs value={appVisibility} onChange={setAppVisibility} />
        </div>
        {appsLoading ? (
          <p className="text-sm text-muted-foreground">Загрузка откликов...</p>
        ) : apps.length === 0 ? (
          <p className="text-sm text-muted-foreground">{appVisibility === "active" ? "Пока нет откликов" : "Скрытых откликов нет"}</p>
        ) : (
          <div className="max-h-[34vh] space-y-1 overflow-y-auto pr-1 sm:max-h-[260px] [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent">
            {apps.map((a) => (
              <div key={a.id} className="premium-row flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <span className="text-sm font-semibold">{a.dj_profiles?.name ?? "DJ"}</span>
                  <div className="text-xs text-muted-foreground">{a.venue_posts?.title ?? ""} В· {getGigTypeLabel(a.venue_posts?.post_type)}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[10px] font-mono ${getApplicationStatusClass(a.status)}`}>{getApplicationStatusLabel(a.status)}</span>
                  {appVisibility === "active" && (canVenueAcceptApplication(a) || canVenueRejectApplication(a)) && (
                    <>
                      <button disabled={pendingAppAction === `accept:${a.id}` || pendingAppAction === `reject:${a.id}`} onClick={() => handleAcceptApp(a)} className="rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-50">{pendingAppAction === `accept:${a.id}` ? "Открываем..." : "Связаться"}</button>
                      <button disabled={pendingAppAction === `accept:${a.id}` || pendingAppAction === `reject:${a.id}`} onClick={() => handleRejectApp(a)} className="p-1 rounded hover:bg-destructive/10 transition-colors disabled:opacity-50"><XIcon className="h-3.5 w-3.5 text-destructive" /></button>
                    </>
                  )}
                  {appVisibility === "active" ? (
                    <button onClick={() => handleHideApp(a)} className="p-1 rounded hover:bg-white/10 transition-colors" title="Скрыть">
                      <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  ) : (
                    <button onClick={() => handleRestoreApp(a)} className="p-1 rounded hover:bg-primary/10 transition-colors" title="Вернуть">
                      <RotateCcw className="h-3.5 w-3.5 text-primary" />
                    </button>
                  )}
                  {a.dj_profiles && <Link to={`/dj/${a.dj_id}`} className="text-[10px] text-primary hover:underline">Профиль</Link>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* My sent invitations */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> Мои приглашения</h2>
        {invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет приглашений</p>
        ) : (
          <div className="max-h-[30vh] space-y-1 overflow-y-auto pr-1 sm:max-h-[220px] [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent">
            {invites.map((inv) => (
              <div key={inv.id} className="premium-row flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <span className="text-sm font-semibold">{inv.dj_profiles?.name ?? "DJ"}</span>
                  <div className="text-xs text-muted-foreground">{inv.venue_posts?.title ?? ""}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-mono ${getApplicationStatusClass(inv.status)}`}>{getApplicationStatusLabel(inv.status)}</span>
                  {inv.status === "new" && (
                    <button onClick={() => handleCancelInvite(inv)} className="p-1 rounded hover:bg-destructive/10 transition-colors" title="Отменить">
                      <XIcon className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
};

export default InboxPage;



