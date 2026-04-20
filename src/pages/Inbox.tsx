import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  useApplicationsForDj, useApplicationsForVenue,
  useInvitationsForDj, useInvitationsForVenue,
  updateApplicationStatus, updateInvitationStatus, updateBookingStatus,
  canUserLeaveBookingReview, createBookingReview, getReviewForBooking,
  createNotification, hideApplicationForDj, hideApplicationForVenue, restoreApplicationForDj, restoreApplicationForVenue,
} from "@/hooks/useMarketplace";
import { hideChatThreadForParticipant, sendChatMessage, useChatMessages, useChatThreadPreviews, useChatThreads } from "@/hooks/useChat";
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
  canCancelBooking,
  canConfirmBooking,
  normalizeBookingStatus,
  type BookingStatus,
} from "@/lib/bookings";
import { toast } from "sonner";

const ApplicationVisibilityTabs = memo(({ value, onChange }: { value: ApplicationVisibility; onChange: (value: ApplicationVisibility) => void }) => (
  <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
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

const QUICK_REPLIES: Record<ChatParticipant["kind"], string[]> = {
  dj: ["Свободен в эту дату", "Какие условия?", "Готов сыграть"],
  venue: ["Какая цена?", "На сколько часов?", "Когда можете?"],
};

const BookingStatusControls = memo(({
  thread,
  participant,
  onUpdate,
}: {
  thread: ChatThread;
  participant: ChatParticipant;
  onUpdate: (threadId: string, updates: Partial<ChatThread>) => void;
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
  const bookingForRules = { status, eventDate: thread.bookingEventDate };
  const bookingForReview = { status, dj_id: thread.djId, venue_id: thread.venueId };
  const canReview = canUserLeaveBookingReview(bookingForReview, participant.profileId);
  const reviewTargetId = participant.profileId === thread.djId ? thread.venueId : thread.djId;
  const canCompleteAsVenue = status === "confirmed" && participant.kind === "venue" && participant.profileId === thread.venueId;
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
  if (canConfirmBooking(bookingForRules)) actions.push("confirmed");
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
      bookingStatus: data.status,
      bookingCompletedAt: data.completed_at ?? thread.bookingCompletedAt ?? null,
    });
    toast.success(nextStatus === "completed" ? "Бронь завершена. Теперь можно оставить отзыв" : "Статус брони обновлён");
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
      if (error.message.includes("уже оставили")) {
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
          <span className="text-[10px] text-muted-foreground">{new Date(thread.bookingEventDate).toLocaleDateString("ru-RU")}</span>
        )}
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => handleStatus(action)}
            disabled={!!updating}
            className="rounded-lg border border-border bg-background/70 px-2 py-1 text-[10px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {updating === action ? "..." : BOOKING_ACTION_LABEL[action]}
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
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-[10px] text-foreground placeholder:text-muted-foreground"
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
  const chatParticipant = useMemo<ChatParticipant | null>(() => {
    if (djProfile) return { profileId: djProfile.id, kind: "dj" };
    if (venueProfile) return { profileId: venueProfile.id, kind: "venue" };
    return null;
  }, [djProfile?.id, venueProfile?.id]);
  const chatThreads = useChatThreads(chatParticipant);

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
        {djProfile && <DjInbox djProfile={djProfile} userId={user.id} onChatThreadReady={chatThreads.addThread} />}
        {venueProfile && <VenueInbox venueProfile={venueProfile} userId={user.id} onChatThreadReady={chatThreads.addThread} />}
        {chatParticipant && (
          <BookingChat
            participant={chatParticipant}
            threads={chatThreads.threads}
            loading={chatThreads.loading}
            removeThreadLocal={chatThreads.removeThreadLocal}
            updateThreadLocal={chatThreads.updateThreadLocal}
          />
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
  removeThreadLocal,
  updateThreadLocal,
}: {
  participant: ChatParticipant;
  threads: ChatThread[];
  loading: boolean;
  removeThreadLocal: (threadId: string) => void;
  updateThreadLocal: (threadId: string, updates: Partial<ChatThread>) => void;
}) => {
  const { previews, updatePreview } = useChatThreadPreviews(threads);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(() => new Set());
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const previousListScrollTop = useRef(0);
  const previousPreviewIds = useRef<Record<string, string>>({});
  const visibleThreads = useMemo(() => {
    const byKey = new Map<string, ChatThread>();
    threads.forEach((thread) => {
      byKey.set(thread.bookingId ?? thread.id, thread);
    });
    return Array.from(byKey.values()).sort((a, b) => {
      const aTime = new Date(previews[a.id]?.createdAt ?? a.updatedAt).getTime();
      const bTime = new Date(previews[b.id]?.createdAt ?? b.updatedAt).getTime();
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

  useLayoutEffect(() => {
    if (!listScrollRef.current) return;
    listScrollRef.current.scrollTop = previousListScrollTop.current;
  }, [visibleThreads]);

  const handleHideThread = useCallback(async (thread: ChatThread) => {
    const { error } = await hideChatThreadForParticipant(thread, participant);
    if (error) {
      toast.error("Не удалось убрать чат из списка");
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
    toast.success("Чат убран только у вас");
  }, [participant, removeThreadLocal, updatePreview]);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[rgba(20,20,25,0.68)] shadow-xl shadow-black/20 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/10 bg-background/20 px-4 py-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" /> Переговоры по заявкам
          </h2>
          <p className="text-[10px] text-muted-foreground">Личные чаты DJ и площадки по конкретным откликам</p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={collapsed ? "Развернуть" : "Свернуть"}
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>
      {collapsed ? null : (
      <div className="p-3">
      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка чатов...</p>
      ) : visibleThreads.length === 0 ? (
        <p className="text-sm text-muted-foreground">У вас пока нет диалогов</p>
      ) : (
        <div className={`grid gap-3 ${panelOpen ? "md:grid-cols-[260px_1fr]" : ""}`}>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-background/35">
            <div className="border-b border-white/10 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Диалоги</p>
            </div>
            <div
              ref={listScrollRef}
              onScroll={(event) => { previousListScrollTop.current = event.currentTarget.scrollTop; }}
              className="max-h-[452px] space-y-1 overflow-y-auto p-2 [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent"
            >
              {visibleThreads.map((thread) => {
                const preview = previews[thread.id];
                const participantName = participant.kind === "dj" ? thread.venueName ?? "Заведение" : thread.djName ?? "DJ";
                const isSelected = selectedThread?.id === thread.id && panelOpen;
                const isUnread = unreadIds.has(thread.id);
                const previewText = preview?.text ?? "Начните обсуждение деталей";

                return (
                  <div
                    key={thread.id}
                    className={`flex items-stretch rounded-xl border transition-colors ${
                      isSelected
                        ? "border-primary/50 bg-primary/10 shadow-sm shadow-primary/10"
                        : "border-transparent bg-transparent hover:border-border hover:bg-card/70"
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
                        {new Date(preview?.createdAt ?? thread.updatedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] font-medium text-primary/90">
                      {thread.gigTitle ?? "Заявка"}{thread.bookingEventDate ? ` · ${new Date(thread.bookingEventDate).toLocaleDateString("ru-RU")}` : ""}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{previewText}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleHideThread(thread)}
                      className="shrink-0 rounded-lg px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title="Убрать чат из моего списка"
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          {selectedThread && panelOpen && (
            <ChatMessages
              thread={selectedThread}
              participant={participant}
              onClose={() => setPanelOpen(false)}
              currentPreview={previews[selectedThread.id]}
              onPreview={updatePreview}
              onBookingUpdate={updateThreadLocal}
            />
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
}: {
  thread: ChatThread;
  participant: ChatParticipant;
  onClose: () => void;
  currentPreview?: ChatMessage;
  onPreview: (threadId: string, message: ChatMessage | null) => void;
  onBookingUpdate: (threadId: string, updates: Partial<ChatThread>) => void;
}) => {
  const { messages, loading, appendMessage, replaceMessage, removeMessage } = useChatMessages(thread, participant);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const previousThreadId = useRef<string | null>(null);
  const quickReplies = QUICK_REPLIES[participant.kind];
  const lastMessage = messages[messages.length - 1];
  const showResponseSpeedHint = !!lastMessage && Date.now() - new Date(lastMessage.createdAt).getTime() > 3 * 60 * 60 * 1000;

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const threadChanged = previousThreadId.current !== thread.id;
    previousThreadId.current = thread.id;
    if (threadChanged || stickToBottomRef.current) {
      node.scrollTo({ top: node.scrollHeight, behavior: threadChanged || messages.length <= 1 ? "auto" : "smooth" });
    }
  }, [messages.length, thread.id]);

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
    <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[rgba(20,20,25,0.72)] shadow-lg shadow-black/15 backdrop-blur-md">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-card/55 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-primary/90">Чат по бронированию</p>
          <h3 className="mt-0.5 truncate text-sm font-semibold text-foreground">{thread.gigTitle ?? "Заявка"}</h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {thread.djName ?? "DJ"} &rarr; {thread.venueName ?? "Заведение"}
          </p>
          <BookingStatusControls thread={thread} participant={participant} onUpdate={onBookingUpdate} />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Закрыть чат"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const node = event.currentTarget;
          stickToBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
        }}
        className="max-h-[392px] min-h-64 overflow-y-auto bg-background/15 px-4 py-4 [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent"
      >
        {loading ? (
          <p className="text-xs text-muted-foreground">Загрузка сообщений...</p>
        ) : messages.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-card/60 p-4 text-center">
            <p className="text-sm font-medium text-foreground">Начните диалог — быстрые ответы повышают шанс сделки</p>
            <p className="text-sm font-medium text-foreground">Обсудите детали бронирования</p>
            <p className="mt-1 text-xs text-muted-foreground">Время, сет, условия и финальное подтверждение лучше держать в одном месте.</p>
          </div>
        ) : (
          <div className="space-y-1 pr-1">
          {messages.map((message, index) => {
            const isMine = message.senderId === participant.profileId;
            const previous = messages[index - 1];
            const next = messages[index + 1];
            const startsGroup = !previous || previous.senderId !== message.senderId;
            const endsGroup = !next || next.senderId !== message.senderId;
            const senderName = message.senderId === thread.djId ? thread.djName ?? "DJ" : thread.venueName ?? "Заведение";

            return (
              <div key={message.id} className={`flex ${isMine ? "justify-end" : "justify-start"} ${startsGroup ? "mt-3" : "mt-1"}`}>
                <div className={`max-w-[84%] ${isMine ? "items-end" : "items-start"}`}>
                  {startsGroup && !isMine && (
                    <p className="mb-1 px-1 text-[10px] font-medium text-muted-foreground">{senderName}</p>
                  )}
                  <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                    isMine
                      ? `${startsGroup ? "rounded-tr-2xl" : "rounded-tr-md"} ${endsGroup ? "rounded-br-md" : "rounded-br-2xl"} bg-primary text-primary-foreground`
                      : `${startsGroup ? "rounded-tl-2xl" : "rounded-tl-md"} ${endsGroup ? "rounded-bl-md" : "rounded-bl-2xl"} border border-border/70 bg-card text-foreground`
                  }`}>
                  <p className="whitespace-pre-wrap break-words">{message.text}</p>
                  {endsGroup && (
                    <p className={`mt-1.5 text-right text-[9px] leading-none ${isMine ? "text-primary-foreground/65" : "text-muted-foreground/80"}`}>
                      {new Date(message.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        )}
      </div>
      <div className="border-t border-white/10 bg-card/55 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {quickReplies.map((reply) => (
            <button
              key={reply}
              type="button"
              onClick={() => setText(reply)}
              className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] font-medium text-primary transition-colors hover:bg-primary/10"
            >
              {reply}
            </button>
          ))}
        </div>
        {showResponseSpeedHint && (
          <p className="mb-2 text-[10px] font-medium text-primary/80">Ответьте быстрее, чтобы не потерять сделку</p>
        )}
        <div className="flex items-center gap-2">
        <input
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm transition-colors placeholder:text-muted-foreground/70 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
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
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
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

  const handleAccept = async (inv: any) => {
    const { error, chatThread } = await updateInvitationStatus(inv.id, "accepted");
    if (error) {
      toast.error(error.message);
      return;
    }
    // Notify venue
    if (inv.venue_profiles?.user_id) {
      await createNotification(inv.venue_profiles.user_id, "status_update", `${djProfile.name} принял приглашение на "${inv.venue_posts?.title ?? ""}"`, inv.id);
    }
    toast.success("Приглашение принято");
    updateInviteLocal(inv.id, "accepted");
    if (chatThread) onChatThreadReady(chatThread);
  };

  const handleReject = async (inv: any) => {
    await updateInvitationStatus(inv.id, "rejected");
    if (inv.venue_profiles?.user_id) {
      await createNotification(inv.venue_profiles.user_id, "status_update", `${djProfile.name} отклонил приглашение на "${inv.venue_posts?.title ?? ""}"`, inv.id);
    }
    toast.success("Приглашение отклонено");
    updateInviteLocal(inv.id, "rejected");
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
              <div key={inv.id} className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-2.5">
                <div className="min-w-0">
                  <span className="text-sm font-semibold">{inv.venue_profiles?.name ?? "Площадка"}</span>
                  <div className="text-xs text-muted-foreground">
                    {inv.venue_posts?.title ?? ""} · {getGigTypeLabel(inv.venue_posts?.post_type)}
                  </div>
                  {inv.message && <p className="text-[10px] text-muted-foreground/70 mt-0.5">"{inv.message}"</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[10px] font-mono ${getApplicationStatusClass(inv.status)}`}>{getApplicationStatusLabel(inv.status)}</span>
                  {inv.status === "new" && (
                    <>
                      <button onClick={() => handleAccept(inv)} className="p-1 rounded hover:bg-primary/10 transition-colors" title="Принять">
                        <Check className="h-3.5 w-3.5 text-primary" />
                      </button>
                      <button onClick={() => handleReject(inv)} className="p-1 rounded hover:bg-destructive/10 transition-colors" title="Отклонить">
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
          <p className="text-sm text-muted-foreground">{appVisibility === "active" ? "Вы ещё не откликались" : "Скрытых откликов нет"}</p>
        ) : (
          <div className="max-h-[34vh] space-y-1 overflow-y-auto pr-1 sm:max-h-[260px] [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent">
            {apps.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-2.5">
                <div className="min-w-0">
                  <span className="text-sm font-semibold">{a.venue_posts?.title ?? "Публикация"}</span>
                  <div className="text-xs text-muted-foreground">
                    {(a.venue_posts as any)?.venue_profiles?.name ?? ""} · {getGigTypeLabel(a.venue_posts?.post_type)} · {a.venue_posts?.event_date ? new Date(a.venue_posts.event_date).toLocaleDateString("ru-RU") : new Date(a.created_at).toLocaleDateString("ru-RU")}
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
                    <button onClick={() => handleHideApp(a)} className="p-1 rounded hover:bg-muted transition-colors" title="Скрыть">
                      <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  ) : (
                    <button onClick={() => handleRestoreApp(a)} className="p-1 rounded hover:bg-primary/10 transition-colors" title="Вернуть">
                      <RotateCcw className="h-3.5 w-3.5 text-primary" />
                    </button>
                  )}
                  {a.venue_posts && <Link to={`/post/${a.post_id}`} className="text-[10px] text-primary hover:underline">Открыть</Link>}
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
  const { invites, refetch: refetchInvites, updateLocal: updateVenueInviteLocal } = useInvitationsForVenue(venueProfile.id);

  const handleAcceptApp = async (app: any) => {
    const { error, chatThread } = await updateApplicationStatus(app.id, "accepted");
    if (error) {
      toast.error("Не удалось принять отклик");
      return;
    }
    updateVenueAppStatusLocal(app.id, "accepted");
    if (chatThread) onChatThreadReady(chatThread);
    // Notify DJ
    if (app.dj_profiles?.user_id) {
      await createNotification(app.dj_profiles.user_id, "status_update", `Ваш отклик на "${app.venue_posts?.title ?? ""}" принят!`, app.id);
    }
    toast.success("Отклик принят");
  };

  const handleRejectApp = async (app: any) => {
    const { error } = await updateApplicationStatus(app.id, "rejected");
    if (error) {
      toast.error("Не удалось отклонить отклик");
      return;
    }
    updateVenueAppStatusLocal(app.id, "rejected");
    if (app.dj_profiles?.user_id) {
      await createNotification(app.dj_profiles.user_id, "status_update", `Ваш отклик на "${app.venue_posts?.title ?? ""}" отклонён`, app.id);
    }
    toast.success("Отклик отклонён");
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
              <div key={a.id} className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-2.5">
                <div className="min-w-0">
                  <span className="text-sm font-semibold">{a.dj_profiles?.name ?? "DJ"}</span>
                  <div className="text-xs text-muted-foreground">{a.venue_posts?.title ?? ""} · {getGigTypeLabel(a.venue_posts?.post_type)}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[10px] font-mono ${getApplicationStatusClass(a.status)}`}>{getApplicationStatusLabel(a.status)}</span>
                  {appVisibility === "active" && (canVenueAcceptApplication(a) || canVenueRejectApplication(a)) && (
                    <>
                      <button onClick={() => handleAcceptApp(a)} className="p-1 rounded hover:bg-primary/10 transition-colors"><Check className="h-3.5 w-3.5 text-primary" /></button>
                      <button onClick={() => handleRejectApp(a)} className="p-1 rounded hover:bg-destructive/10 transition-colors"><XIcon className="h-3.5 w-3.5 text-destructive" /></button>
                    </>
                  )}
                  {appVisibility === "active" ? (
                    <button onClick={() => handleHideApp(a)} className="p-1 rounded hover:bg-muted transition-colors" title="Скрыть">
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
              <div key={inv.id} className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-2.5">
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
