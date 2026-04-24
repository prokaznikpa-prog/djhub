import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getDjExperienceLabel } from "@/lib/djOptions";
import {
  useApplicationsForDj, useApplicationsForVenue,
  hideApplicationForDj, hideApplicationForVenue, restoreApplicationForDj, restoreApplicationForVenue,
  updateApplicationStatus,
} from "@/domains/applications/applications.hooks";
import {
  useInvitationsForDj, useInvitationsForVenue,
  updateInvitationStatus,
} from "@/domains/invitations/invitations.hooks";
import {
  getVenuePostEngagement,
  getVenuePostSelection,
  updateVenuePost,
  useVenuePostsByVenue,
} from "@/domains/posts/posts.hooks";
import { createNotification } from "@/domains/notifications/notifications.hooks";
import EditProfileModal from "@/components/EditProfileModal";
import { getDjAvailabilityLabel } from "@/lib/djOptions";
import CreatePostModal from "@/components/CreatePostModal";
import { MapPin, Clock, Briefcase, Users, Handshake, Send, Pencil, Plus, ToggleLeft, ToggleRight, X as XIcon, Check, Mail, FileText, EyeOff, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { getCityLabel } from "@/lib/geography";
import { getProfileAvatar, getProfileStyles, type DjProfile, type ProfileBase, type VenueProfile } from "@/lib/profile";
import {
  canDjCancelApplication,
  canVenueAcceptApplication,
  canVenueRejectApplication,
  getApplicationStatusClass,
  getApplicationStatusLabel,
  type ApplicationVisibility,
} from "@/lib/applications";
import { getGigTypeLabel, GIG_STATUS_LABEL } from "@/lib/gigs";
import {
  VENUE_TYPE_OPTIONS,
  VENUE_EQUIPMENT_OPTIONS,
  VENUE_CONDITIONS_OPTIONS,
  getVenueOptionLabel,
  
} from "@/lib/venueOptions";
type EditButton = ReactNode;

const notifyInBackground = (task: Promise<unknown>) => {
  void task.catch((error) => {
    console.error("Background notification failed", error);
  });
};

const ApplicationVisibilityTabs = ({ value, onChange }: { value: ApplicationVisibility; onChange: (value: ApplicationVisibility) => void }) => (
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
);

const ProfilePageShell = ({ editButton, children }: { editButton: EditButton; children: ReactNode }) => (
  <div className="min-h-screen pt-20 pb-12">
    <div className="container mx-auto max-w-3xl px-4 space-y-5">
      <div className="premium-surface flex items-start justify-between p-4">
        <div>
          <p className="text-xs font-semibold uppercase text-primary">DJHUB</p>
          <h1 className="mt-1 text-xl font-bold text-foreground">Мой профиль</h1>
        </div>
        {editButton}
      </div>
      {children}
    </div>
  </div>
);

const ProfileSummaryCard = ({ profile, children }: { profile: ProfileBase; children: ReactNode }) => {
  const avatar = getProfileAvatar(profile);

  return (
    <div className="premium-surface p-5">
      <div className="flex min-w-0 gap-4">
        <div className="flex-1 min-w-0 space-y-2">{children}</div>
        {avatar && (
          <div className="shrink-0">
            <img src={avatar} alt={profile.name} className="h-24 w-24 rounded-2xl border border-white/5 object-cover shadow-lg sm:h-28 sm:w-28" />
          </div>
        )}
      </div>
    </div>
  );
};

const ProfileStylePills = ({ profile, className = "flex flex-wrap gap-1.5" }: { profile: ProfileBase; className?: string }) => (
  <div className={className}>
    {getProfileStyles(profile).map((style) => (
      <span key={style} className="premium-chip">{style}</span>
    ))}
  </div>
);

const Profile = () => {
  const { user, djProfile, venueProfile, profilesLoading, refreshProfiles } = useAuth();
  const [showEdit, setShowEdit] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);

  const refresh = () => refreshProfiles();

  const editButton = (
    <button 
    data-testid="profile-edit-button"
    onClick={() => setShowEdit(true)} className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15">
      <Pencil className="h-4 w-4 shrink-0" /> Редактировать
    </button>
  );

  if (djProfile) {
    return <DjProfileSection djProfile={djProfile} editButton={editButton} showEdit={showEdit} setShowEdit={setShowEdit} refresh={refresh} />;
  }

  if (venueProfile) {
    return <VenueProfileSection venueProfile={venueProfile} editButton={editButton} showEdit={showEdit} setShowEdit={setShowEdit} showCreatePost={showCreatePost} setShowCreatePost={setShowCreatePost} refresh={refresh} />;
  }

  if (user && profilesLoading) {
    return (
      <ProfilePageShell editButton={editButton}>
        <div className="premium-surface p-4">
          <p className="text-sm text-muted-foreground">Загружаем профиль...</p>
        </div>
      </ProfilePageShell>
    );
  }

  return (
    <div className="min-h-screen pt-20 flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Мой профиль</h1>
        <p className="text-muted-foreground">У вас пока нет профиля</p>
        <Link to="/register" className="inline-block rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
          Создать профиль
        </Link>
      </div>
    </div>
  );
};

// ---- DJ Section ----
const DjProfileSection = ({ djProfile, editButton, showEdit, setShowEdit, refresh }: { djProfile: DjProfile; editButton: EditButton; showEdit: boolean; setShowEdit: (value: boolean) => void; refresh: () => void | Promise<void> }) => {
  const [appVisibility, setAppVisibility] = useState<ApplicationVisibility>("active");
  const { apps: supaApps, loading: appsLoading, hideLocal: hideDjAppLocal, updateStatusLocal: updateDjAppStatusLocal } = useApplicationsForDj(djProfile.id, appVisibility);
  const { invites, updateLocal: updateInviteLocal } = useInvitationsForDj(djProfile.id);
  const [pendingInviteAction, setPendingInviteAction] = useState<string | null>(null);

  const handleAcceptInvite = async (inv: any) => {
    if (pendingInviteAction) return;
    setPendingInviteAction(`accept:${inv.id}`);
    const { error } = await updateInvitationStatus(inv.id, "accepted");
    if (error) {
      setPendingInviteAction(null);
      toast.error(error.message);
      return;
    }
    updateInviteLocal(inv.id, "accepted");
    toast.success("Чат открыт");
    setPendingInviteAction(null);
    if (inv.venue_profiles?.user_id) {
      notifyInBackground(createNotification(inv.venue_profiles.user_id, "status_update", `${djProfile.name} принял приглашение на "${inv.venue_posts?.title ?? ""}"`, inv.id));
    }
  };

  const handleRejectInvite = async (inv: any) => {
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

  const handleCancelApp = async (id: string) => {
    const { error } = await updateApplicationStatus(id, "cancelled");
    if (error) {
      toast.error("Не удалось отменить отклик");
      return;
    }
    updateDjAppStatusLocal(id, "cancelled");
    toast.success("Отклик отменён");
  };

  const handleHideApp = async (id: string) => {
    const { error } = await hideApplicationForDj(id);
    if (error) {
      toast.error("Не удалось скрыть отклик");
      return;
    }
    hideDjAppLocal(id);
    toast.success("Отклик скрыт");
  };

  const handleRestoreApp = async (id: string) => {
    const { error } = await restoreApplicationForDj(id);
    if (error) {
      toast.error("Не удалось вернуть отклик");
      return;
    }
    hideDjAppLocal(id);
    toast.success("Отклик возвращён");
  };

  return (
    <ProfilePageShell editButton={editButton}>
        <ProfileSummaryCard profile={djProfile}>
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-white">{djProfile.name}</h2>
                <span className="max-w-[45%] shrink-0 truncate font-mono text-sm text-primary">{djProfile.price}</span>
              </div>
              <div className="flex min-w-0 items-center gap-2 text-sm text-gray-400">
                <MapPin className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{getCityLabel(djProfile.city)}</span>
              </div>
              <ProfileStylePills profile={djProfile} />
              {djProfile.bio && <p className="text-xs text-secondary-foreground line-clamp-2">{djProfile.bio}</p>}
              <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-2 pt-1 text-xs text-gray-400">
                {djProfile.experience && <span className="flex min-w-0 items-center gap-2"><Clock className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{getDjExperienceLabel(djProfile.experience)}</span></span>}
                {djProfile.availability && <span className="flex min-w-0 items-center gap-2"><Briefcase className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{getDjAvailabilityLabel(djProfile.availability)}</span></span>}
                <span className="flex min-w-0 items-center gap-2"><Handshake className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">Коллаб: {djProfile.openToCollab ? "Да" : "Нет"}</span></span>
                <span className="flex min-w-0 items-center gap-2"><Users className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">Crew: {djProfile.openToCrew ? "Да" : "Нет"}</span></span>
              </div>
        </ProfileSummaryCard>

        {/* My applications */}
        <div className="space-y-2 min-h-[96px]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5 text-primary" /> Мои отклики
            </h2>
            <ApplicationVisibilityTabs value={appVisibility} onChange={setAppVisibility} />
          </div>
          {appsLoading ? (
            <p className="text-xs text-muted-foreground">Загрузка откликов...</p>
          ) : supaApps.length === 0 ? (
            <p className="text-xs text-muted-foreground">{appVisibility === "active" ? "Вы ещё не откликались" : "Скрытых откликов нет"}</p>
          ) : (
            <div className="max-h-[34vh] space-y-1 overflow-y-auto pr-1 sm:max-h-[260px] [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent">
              {supaApps.map((a: any) => (
                <div key={a.id} className="premium-row flex items-center justify-between px-3 py-2.5">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold truncate block">{a.venue_posts?.title ?? "Публикация"}</span>
                    <div className="text-[10px] text-muted-foreground">
                      {a.venue_posts?.venue_profiles?.name ?? ""} В· {getGigTypeLabel(a.venue_posts?.post_type)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-mono ${getApplicationStatusClass(a.status)}`}>{getApplicationStatusLabel(a.status)}</span>
                    {appVisibility === "active" && canDjCancelApplication(a) && (
                      <button onClick={() => handleCancelApp(a.id)} className="p-1 rounded hover:bg-destructive/10 transition-colors" title="Отменить">
                        <XIcon className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    )}
                    {appVisibility === "active" ? (
                      <button onClick={() => handleHideApp(a.id)} className="p-1 rounded hover:bg-white/10 transition-colors" title="Скрыть">
                        <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    ) : (
                      <button onClick={() => handleRestoreApp(a.id)} className="p-1 rounded hover:bg-primary/10 transition-colors" title="Вернуть">
                        <RotateCcw className="h-3.5 w-3.5 text-primary" />
                      </button>
                    )}
                    {a.venue_posts && <Link to={`/post/${a.post_id}`} className="text-[10px] text-primary hover:underline">Открыть</Link>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My invitations */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-primary" /> Мои приглашения
          </h2>
          {invites.length === 0 ? (
            <p className="text-xs text-muted-foreground">Нет приглашений</p>
          ) : (
            <div className="max-h-[30vh] space-y-1 overflow-y-auto pr-1 sm:max-h-[220px] [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent">
              {invites.map((inv: any) => (
                <div key={inv.id} className="premium-row flex items-center justify-between px-3 py-2.5">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold truncate block">{inv.venue_profiles?.name ?? "Площадка"}</span>
                    <div className="text-[10px] text-muted-foreground">{inv.venue_posts?.title ?? ""}</div>
                    {inv.message && <p className="text-[10px] text-muted-foreground/70 mt-0.5">"{inv.message}"</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[10px] font-mono ${getApplicationStatusClass(inv.status)}`}>{getApplicationStatusLabel(inv.status)}</span>
                    {inv.status === "new" && (
                      <>
                        <button disabled={pendingInviteAction === `accept:${inv.id}` || pendingInviteAction === `reject:${inv.id}`} onClick={() => handleAcceptInvite(inv)} className="rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-50">{pendingInviteAction === `accept:${inv.id}` ? "Открываем..." : "Связаться"}</button>
                        <button disabled={pendingInviteAction === `accept:${inv.id}` || pendingInviteAction === `reject:${inv.id}`} onClick={() => handleRejectInvite(inv)} className="p-1 rounded hover:bg-destructive/10 transition-colors disabled:opacity-50" title="Отклонить">
                          <XIcon className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      {showEdit && <EditProfileModal type="dj" djProfile={djProfile} onClose={() => setShowEdit(false)} onSaved={refresh} />}
    </ProfilePageShell>
  );
};

// ---- Venue Section ----
const VenueProfileSection = ({ venueProfile, editButton, showEdit, setShowEdit, showCreatePost, setShowCreatePost, refresh }: { venueProfile: VenueProfile; editButton: EditButton; showEdit: boolean; setShowEdit: (value: boolean) => void; showCreatePost: boolean; setShowCreatePost: (value: boolean) => void; refresh: () => void | Promise<void> }) => {
  const [appVisibility, setAppVisibility] = useState<ApplicationVisibility>("active");
  const { posts: myPosts, loading: postsLoading, refetch: refetchPosts, addPost, updatePost } = useVenuePostsByVenue(venueProfile.id);
  const { apps: venueApps, loading: appsLoading, hideLocal: hideVenueAppLocal, updateStatusLocal: updateVenueAppStatusLocal } = useApplicationsForVenue(venueProfile.id, appVisibility);
  const { invites: venueInvites } = useInvitationsForVenue(venueProfile.id);
  const [pendingAppAction, setPendingAppAction] = useState<string | null>(null);
  const [engagedPostIds, setEngagedPostIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const openPosts = myPosts.filter((post) => post.status === "open");
    if (openPosts.length === 0) {
      setEngagedPostIds(new Set());
      return;
    }

    let cancelled = false;
    Promise.all(openPosts.map(async (post) => {
      const [selection, engagement] = await Promise.all([
        getVenuePostSelection(post.id),
        getVenuePostEngagement(post.id),
      ]);
      return !selection.isSelected && engagement.hasEngagement ? post.id : null;
    })).then((ids) => {
      if (!cancelled) setEngagedPostIds(new Set(ids.filter((id): id is string => !!id)));
    });

    return () => { cancelled = true; };
  }, [myPosts]);

  const handleTogglePost = async (postId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "open" ? "closed" : "open";
    if (nextStatus === "closed") {
      const selection = await getVenuePostSelection(postId);
      if (selection.error) {
        toast.error(selection.error.message);
        return;
      }
      const engagement = selection.isSelected ? { error: null, hasEngagement: false } : await getVenuePostEngagement(postId);
      if (engagement.error) {
        toast.error(engagement.error.message);
        return;
      }
      if (engagement.hasEngagement) {
        toast.error("Публикацию с откликами, приглашениями, бронями или чатом нельзя закрыть.");
        return;
      }
    }

    const { data, error } = await updateVenuePost(postId, { status: nextStatus });
    if (error) {
      toast.error("Не удалось обновить статус");
      return;
    }
    updatePost(postId, data ?? { status: nextStatus });
    void refetchPosts({ silent: true, force: true });
    toast.success("Статус обновлён");
  };

  const handleAcceptApp = async (app: any) => {
    if (pendingAppAction) return;
    setPendingAppAction(`accept:${app.id}`);
    const { error } = await updateApplicationStatus(app.id, "accepted");
    if (error) {
      setPendingAppAction(null);
      toast.error("Не удалось открыть чат");
      return;
    }
    updateVenueAppStatusLocal(app.id, "accepted");
    toast.success("Чат открыт");
    setPendingAppAction(null);
    if (app.dj_profiles?.user_id) {
      notifyInBackground(createNotification(app.dj_profiles.user_id, "status_update", `Площадка хочет обсудить ваш отклик на "${app.venue_posts?.title ?? ""}"`, app.id));
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

  const handleHideVenueApp = async (id: string) => {
    const { error } = await hideApplicationForVenue(id);
    if (error) {
      toast.error("Не удалось скрыть отклик");
      return;
    }
    hideVenueAppLocal(id);
    toast.success("Отклик скрыт");
  };

  const handleRestoreVenueApp = async (id: string) => {
    const { error } = await restoreApplicationForVenue(id);
    if (error) {
      toast.error("Не удалось вернуть отклик");
      return;
    }
    hideVenueAppLocal(id);
    toast.success("Отклик возвращён");
  };

  return (
    <ProfilePageShell editButton={editButton}>
        <ProfileSummaryCard profile={venueProfile}>
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-white">{venueProfile.name}</h2>
                <span className="max-w-[45%] shrink-0 truncate rounded-full border border-white/5 bg-[#1c2027] px-2 py-0.5 text-xs font-medium text-gray-200">{getVenueOptionLabel(venueProfile.type, VENUE_TYPE_OPTIONS)}</span>
              </div>
              <div className="flex min-w-0 items-center gap-2 text-sm text-gray-400">
  <MapPin className="h-4 w-4 shrink-0" /> <span className="min-w-0 truncate">{getCityLabel(venueProfile.city)}</span>
</div>
              {venueProfile.description && (
  <p className="text-xs text-secondary-foreground line-clamp-2">
    {venueProfile.description}
  </p>
)}
<div className="mt-3 space-y-2 text-sm text-muted-foreground">
  {venueProfile.address && (
    <div>
      <span className="font-medium text-foreground">Адрес:</span> {venueProfile.address}
    </div>
  )}

  {venueProfile.equipment && (
  <div>
    <span className="font-medium text-foreground">Оборудование:</span>{" "}
    {getVenueOptionLabel(
      venueProfile.equipment,
      VENUE_EQUIPMENT_OPTIONS
    )}
  </div>
)}

  {(venueProfile.foodDrinks || venueProfile.food_drinks) && (
    <div>
      <span className="font-medium text-foreground">Условия:</span>{" "}
     {getVenueOptionLabel(
  venueProfile.foodDrinks || venueProfile.food_drinks,
  VENUE_CONDITIONS_OPTIONS
)}
    </div>
  )}
</div>

{getProfileStyles(venueProfile).length > 0 && (
  <ProfileStylePills profile={venueProfile} className="mt-3 flex flex-wrap gap-2" />
)}
        </ProfileSummaryCard>

        {/* My publications */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-primary" /> Мои публикации
            </h2>
            <button onClick={() => setShowCreatePost(true)} className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
              <Plus className="h-3 w-3" /> Создать
            </button>
          </div>
          {postsLoading ? (
            <div className="space-y-1">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-xl border border-white/5 bg-[#171a20]" />
              ))}
            </div>
          ) : myPosts.filter((post) => post.status === "open").length === 0 ? (
            <p className="text-xs text-muted-foreground">У вас пока нет публикаций</p>
          ) : (
            <div className="max-h-[32vh] space-y-1 overflow-y-auto pr-1 sm:max-h-[240px] [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent">
              {myPosts.filter((post) => post.status === "open").map((p: any) => (
                <div key={p.id} className="premium-row flex items-center justify-between px-3 py-2.5">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold truncate block">{p.title}</span>
                    <div className="text-[10px] text-muted-foreground">{getGigTypeLabel(p.post_type)} В· {p.budget || "—"}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`text-[10px] font-mono ${p.status === "open" ? "text-primary" : "text-muted-foreground"}`}>
                      {p.status === "open" ? GIG_STATUS_LABEL.open : GIG_STATUS_LABEL.closed}
                    </span>
                    <button
                      onClick={() => handleTogglePost(p.id, p.status)}
                      disabled={p.status === "open" && engagedPostIds.has(p.id)}
                      title={p.status === "open" && engagedPostIds.has(p.id) ? "Публикацию с откликами, приглашениями, бронями или чатом нельзя закрыть" : undefined}
                      className="p-1 rounded hover:bg-white/10 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {p.status === "open" ? <ToggleRight className="h-3.5 w-3.5 text-primary" /> : <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Applications on my posts */}
        <div className="space-y-2 min-h-[96px]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5 text-primary" /> Отклики на мои публикации
            </h2>
            <ApplicationVisibilityTabs value={appVisibility} onChange={setAppVisibility} />
          </div>
          {appsLoading ? (
            <p className="text-xs text-muted-foreground">Загрузка откликов...</p>
          ) : venueApps.length === 0 ? (
            <p className="text-xs text-muted-foreground">{appVisibility === "active" ? "Пока нет откликов" : "Скрытых откликов нет"}</p>
          ) : (
            <div className="max-h-[34vh] space-y-1 overflow-y-auto pr-1 sm:max-h-[260px] [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent">
              {venueApps.map((a: any) => (
                <div key={a.id} className="premium-row flex items-center justify-between px-3 py-2.5">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold truncate block">{a.dj_profiles?.name ?? "DJ"}</span>
                    <div className="text-[10px] text-muted-foreground">{a.venue_posts?.title ?? ""}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[10px] font-mono ${getApplicationStatusClass(a.status)}`}>{getApplicationStatusLabel(a.status)}</span>
                    {appVisibility === "active" && (canVenueAcceptApplication(a) || canVenueRejectApplication(a)) && (
                      <>
                        <button
                          disabled={pendingAppAction === `accept:${a.id}` || pendingAppAction === `reject:${a.id}`}
                          onClick={() => handleAcceptApp(a)}
                          className="rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
                        >
                          {pendingAppAction === `accept:${a.id}` ? "Открываем..." : "Связаться"}
                        </button>
                        <button
                          disabled={pendingAppAction === `accept:${a.id}` || pendingAppAction === `reject:${a.id}`}
                          onClick={() => handleRejectApp(a)}
                          className="p-1 rounded hover:bg-destructive/10 transition-colors disabled:opacity-50"
                        >
                          <XIcon className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </>
                    )}
                    {appVisibility === "active" ? (
                      <button onClick={() => handleHideVenueApp(a.id)} className="p-1 rounded hover:bg-white/10 transition-colors" title="Скрыть">
                        <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    ) : (
                      <button onClick={() => handleRestoreVenueApp(a.id)} className="p-1 rounded hover:bg-primary/10 transition-colors" title="Вернуть">
                        <RotateCcw className="h-3.5 w-3.5 text-primary" />
                      </button>
                    )}
                    {a.dj_profiles && <Link to={`/dj/${a.dj_id}`} className="text-[10px] text-primary hover:underline">Профиль</Link>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My invitations sent */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-primary" /> Мои приглашения DJ
          </h2>
          {venueInvites.length === 0 ? (
            <p className="text-xs text-muted-foreground">Нет приглашений</p>
          ) : (
            <div className="max-h-[30vh] space-y-1 overflow-y-auto pr-1 sm:max-h-[220px] [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent">
              {venueInvites.map((inv: any) => (
                <div key={inv.id} className="premium-row flex items-center justify-between px-3 py-2.5">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold truncate block">{inv.dj_profiles?.name ?? "DJ"}</span>
                    <div className="text-[10px] text-muted-foreground">{inv.venue_posts?.title ?? ""}</div>
                  </div>
                  <span className={`text-[10px] font-mono shrink-0 ${getApplicationStatusClass(inv.status)}`}>{getApplicationStatusLabel(inv.status)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      {showEdit && <EditProfileModal type="venue" venueProfile={venueProfile} onClose={() => setShowEdit(false)} onSaved={refresh} />}
      {showCreatePost && <CreatePostModal venueId={venueProfile.id} venueCity={venueProfile.city} onClose={() => setShowCreatePost(false)} onCreated={(post) => { if (post) addPost(post); void refetchPosts({ silent: true, force: true }); setShowCreatePost(false); }} />}
    </ProfilePageShell>
  );
};

export default Profile;

