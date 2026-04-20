import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  useAllApplications, useAllInvitations, useAllVenuePosts,
  updateApplicationStatus, updateInvitationStatus, deleteVenuePost,
} from "@/hooks/useMarketplace";
import { Trash2, Eye, EyeOff, ArrowLeft, MessageCircle, Check, X, Archive, Ban } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { getGigTypeLabel, GIG_STATUS_LABEL } from "@/lib/gigs";
import {
  canVenueAcceptApplication,
  canVenueRejectApplication,
  getApplicationStatusClass,
  getApplicationStatusLabel,
} from "@/lib/applications";
import { getCityLabel } from "@/lib/geography";

const statusLabel: Record<string, string> = { active: "Активен", hidden: "Скрыт", blocked: "Заблокирован", archived: "Архив", closed: "Закрыт", open: "Открыт" };
const statusColor: Record<string, string> = { active: "text-primary", hidden: "text-muted-foreground", blocked: "text-destructive", archived: "text-muted-foreground", closed: "text-destructive", open: "text-primary" };
const moderationLabel: Record<string, string> = { active: "Виден", hidden: "Скрыт", archived: "Архив", blocked: "Блок" };

type ProfileStatus = "active" | "hidden" | "blocked" | "archived";
type PostModerationStatus = "active" | "hidden" | "archived" | "blocked";

const Admin = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"djs" | "venues" | "posts" | "apps" | "invites">("djs");

  const [djItems, setDjItems] = useState<Tables<"dj_profiles">[]>([]);
  const [venueItems, setVenueItems] = useState<Tables<"venue_profiles">[]>([]);

  const { posts: allPosts, removePost, updatePost } = useAllVenuePosts();
  const { apps: allApps, refetch: refetchApps } = useAllApplications();
  const { invites: allInvites, refetch: refetchInvites } = useAllInvitations();

  useEffect(() => {
    supabase.from("dj_profiles").select("*").order("created_at", { ascending: false }).then(({ data }) => setDjItems(data ?? []));
    supabase.from("venue_profiles").select("*").order("created_at", { ascending: false }).then(({ data }) => setVenueItems(data ?? []));
  }, []);

  const getDjDependencyCount = async (id: string) => {
    const [apps, invites, bookings, chats] = await Promise.all([
      supabase.from("applications").select("id", { count: "exact", head: true }).eq("dj_id", id),
      supabase.from("invitations").select("id", { count: "exact", head: true }).eq("dj_id", id),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("dj_id", id),
      supabase.from("chat_threads").select("id", { count: "exact", head: true }).eq("dj_id", id),
    ]);
    const error = apps.error || invites.error || bookings.error || chats.error;
    return { count: (apps.count ?? 0) + (invites.count ?? 0) + (bookings.count ?? 0) + (chats.count ?? 0), error };
  };

  const getVenueDependencyCount = async (id: string) => {
    const [posts, invites, bookings, chats] = await Promise.all([
      supabase.from("venue_posts").select("id", { count: "exact", head: true }).eq("venue_id", id),
      supabase.from("invitations").select("id", { count: "exact", head: true }).eq("venue_id", id),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("venue_id", id),
      supabase.from("chat_threads").select("id", { count: "exact", head: true }).eq("venue_id", id),
    ]);
    const error = posts.error || invites.error || bookings.error || chats.error;
    return { count: (posts.count ?? 0) + (invites.count ?? 0) + (bookings.count ?? 0) + (chats.count ?? 0), error };
  };

  const handleDjStatus = async (dj: Tables<"dj_profiles">, status: ProfileStatus) => {
    const { error } = await supabase.from("dj_profiles").update({ status }).eq("id", dj.id);
    if (error) { toast.error("Не удалось обновить статус DJ"); return; }
    setDjItems((prev) => prev.map((d) => d.id === dj.id ? { ...d, status } : d));
    toast.success(status === "active" ? "DJ снова виден в маркетплейсе" : "Статус DJ обновлён");
  };

  const handleDeleteDj = async (id: string) => {
    if (!confirm("Удалить DJ навсегда? Это доступно только без связанной истории.")) return;
    const deps = await getDjDependencyCount(id);
    if (deps.error) { toast.error("Не удалось проверить связанные данные DJ"); return; }
    if (deps.count > 0) {
      toast.error("Нельзя удалить DJ: есть связанная история. Используйте скрытие, архив или блокировку.");
      return;
    }
    const { error, count } = await supabase.from("dj_profiles").delete({ count: "exact" }).eq("id", id);
    if (error) { toast.error("Нельзя удалить DJ: есть связанные данные. Используйте архив или блокировку."); return; }
    if (count === 0) { toast.error("Не удалось удалить — нет прав администратора"); return; }
    setDjItems((prev) => prev.filter((d) => d.id !== id));
    toast.success("DJ удалён");
  };

  const handleToggleDj = async (dj: Tables<"dj_profiles">) => {
    await handleDjStatus(dj, dj.status === "active" ? "hidden" : "active");
  };

  const handleVenueStatus = async (venue: Tables<"venue_profiles">, status: ProfileStatus) => {
    const { error } = await supabase.from("venue_profiles").update({ status }).eq("id", venue.id);
    if (error) { toast.error("Не удалось обновить статус заведения"); return; }
    setVenueItems((prev) => prev.map((v) => v.id === venue.id ? { ...v, status } : v));
    toast.success(status === "active" ? "Заведение снова видно в маркетплейсе" : "Статус заведения обновлён");
  };

  const handleDeleteVenue = async (id: string) => {
    if (!confirm("Удалить заведение навсегда? Это доступно только без связанной истории.")) return;
    const deps = await getVenueDependencyCount(id);
    if (deps.error) { toast.error("Не удалось проверить связанные данные заведения"); return; }
    if (deps.count > 0) {
      toast.error("Нельзя удалить заведение: есть связанная история. Используйте скрытие, архив или блокировку.");
      return;
    }
    const { error, count } = await supabase.from("venue_profiles").delete({ count: "exact" }).eq("id", id);
    if (error) { toast.error("Нельзя удалить заведение: есть связанные данные. Используйте архив или блокировку."); return; }
    if (count === 0) { toast.error("Не удалось удалить — нет прав администратора"); return; }
    setVenueItems((prev) => prev.filter((v) => v.id !== id));
    toast.success("Заведение удалено");
  };

  const handleToggleVenue = async (venue: Tables<"venue_profiles">) => {
    await handleVenueStatus(venue, venue.status === "active" ? "hidden" : "active");
  };

  const handleAppStatus = async (id: string, status: "accepted" | "rejected") => {
    const { error } = await updateApplicationStatus(id, status);
    if (error) {
      toast.error(error.message || "Не удалось обновить статус");
      return;
    }
    toast.success("Статус обновлён");
    refetchApps();
  };

  const handleInviteStatus = async (id: string, status: "accepted" | "rejected") => {
    await updateInvitationStatus(id, status);
    toast.success("Статус обновлён");
    refetchInvites();
  };

  const handleDeletePost = async (id: string) => {
    const { error, action } = await deleteVenuePost(id);
    if (error) {
      toast.error(error.message || "Нельзя удалить публикацию: есть связанная история. Используйте скрытие или архив.");
      return;
    }
    if (action === "archived") {
      updatePost(id, { status: "closed", moderation_status: "archived" } as any);
      toast.success("Публикация перенесена в архив");
      return;
    }
    if (action === "deleted") {
      removePost(id);
      toast.success("Публикация удалена");
    }
  };

  const handleForceClosePost = async (id: string) => {
    const post = allPosts.find((item) => item.id === id) as any;
    if (post?.moderation_status === "archived") { toast.error("Публикация находится в архиве"); return; }
    if (post?.moderation_status === "blocked") { toast.error("Публикация заблокирована модератором"); return; }
    const { data, error } = await supabase
      .from("venue_posts")
      .update({ status: "closed" })
      .eq("id", id)
      .select("*, venue_profiles(*)")
      .maybeSingle();
    if (error) { toast.error("Не удалось закрыть публикацию"); return; }
    if (data) updatePost(id, data as any);
    toast.success("Публикация закрыта");
  };

  const handlePostModeration = async (id: string, moderationStatus: PostModerationStatus) => {
    const updates = moderationStatus === "archived"
      ? { status: "closed", moderation_status: moderationStatus }
      : { moderation_status: moderationStatus };
    const { data, error } = await supabase
      .from("venue_posts" as any)
      .update(updates)
      .eq("id", id)
      .select("*, venue_profiles(*)")
      .maybeSingle();
    if (error) { toast.error("Не удалось обновить модерацию публикации"); return; }
    if (data) updatePost(id, data as any);
    toast.success(moderationStatus === "active" ? "Публикация снова видна" : "Модерация публикации обновлена");
  };

  const tabs = [
    { key: "djs" as const, label: "DJ", count: djItems.length },
    { key: "venues" as const, label: "Заведения", count: venueItems.length },
    { key: "posts" as const, label: "Публикации", count: allPosts.length },
    { key: "apps" as const, label: "Отклики", count: allApps.length },
    { key: "invites" as const, label: "Приглашения", count: allInvites.length },
  ];

  return (
    <div className="min-h-screen pt-20 pb-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/djs")} className="rounded-lg border border-white/10 bg-background/35 p-2 text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-2xl font-bold"><span className="text-primary">Админ</span> панель</h1>
          </div>
          <Link to="/admin/community" className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15">
            <MessageCircle className="h-3.5 w-3.5" /> Комьюнити чат
          </Link>
        </div>

        <div className="premium-surface mb-6 flex gap-1 overflow-x-auto p-1">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${tab === t.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}>
              {t.label} <span className="opacity-60">({t.count})</span>
            </button>
          ))}
        </div>

        {tab === "djs" && (
          <div className="space-y-1">
            {djItems.map((dj) => (
              <div key={dj.id} className="premium-row flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{dj.name}</span>
                    <span className={`text-[10px] font-mono ${statusColor[dj.status]}`}>{statusLabel[dj.status]}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{getCityLabel(dj.city)} · {dj.price}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleToggleDj(dj)} className="p-1.5 rounded hover:bg-white/10 transition-colors">
                    {dj.status === "active" ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-primary" />}
                  </button>
                  <button onClick={() => handleDjStatus(dj, "blocked")} className="p-1.5 rounded hover:bg-destructive/10 transition-colors" title="Заблокировать">
                    <Ban className="h-3.5 w-3.5 text-destructive" />
                  </button>
                  <button onClick={() => handleDjStatus(dj, "archived")} className="p-1.5 rounded hover:bg-white/10 transition-colors" title="В архив">
                    <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => handleDeleteDj(dj.id)} className="p-1.5 rounded hover:bg-destructive/10 transition-colors">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "venues" && (
          <div className="space-y-1">
            {venueItems.map((v) => (
              <div key={v.id} className="premium-row flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{v.name}</span>
                    <span className={`text-[10px] font-mono ${statusColor[v.status]}`}>{statusLabel[v.status]}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{getCityLabel(v.city)} · {v.type}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleToggleVenue(v)} className="p-1.5 rounded hover:bg-white/10 transition-colors">
                    {v.status === "active" ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-primary" />}
                  </button>
                  <button onClick={() => handleVenueStatus(v, "blocked")} className="p-1.5 rounded hover:bg-destructive/10 transition-colors" title="Заблокировать">
                    <Ban className="h-3.5 w-3.5 text-destructive" />
                  </button>
                  <button onClick={() => handleVenueStatus(v, "archived")} className="p-1.5 rounded hover:bg-white/10 transition-colors" title="В архив">
                    <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => handleDeleteVenue(v.id)} className="p-1.5 rounded hover:bg-destructive/10 transition-colors">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "posts" && (
          <div className="space-y-1">
            {allPosts.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Нет публикаций</p>}
            {allPosts.map((p) => (
              <div key={p.id} className="premium-row flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{p.title}</span>
                    <span className="text-[10px] text-muted-foreground">{getGigTypeLabel(p.post_type)}</span>
                    <span className={`text-[10px] font-mono ${p.status === "open" ? "text-primary" : "text-muted-foreground"}`}>{p.status === "open" ? GIG_STATUS_LABEL.open : GIG_STATUS_LABEL.closed}</span>
                    <span className="text-[10px] text-muted-foreground">{moderationLabel[(p as any).moderation_status ?? "active"] ?? ""}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{(p as any).venue_profiles?.name ?? ""} · {getCityLabel(p.city)}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.status === "open" && !["archived", "blocked"].includes((p as any).moderation_status ?? "active") && (
                    <button onClick={() => handleForceClosePost(p.id)} className="p-1.5 rounded hover:bg-white/10 transition-colors" title="Закрыть">
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                  {!["archived", "blocked"].includes((p as any).moderation_status ?? "active") && (
                    <button onClick={() => handlePostModeration(p.id, ((p as any).moderation_status ?? "active") === "hidden" ? "active" : "hidden")} className="p-1.5 rounded hover:bg-white/10 transition-colors" title="Скрыть из маркетплейса">
                      {((p as any).moderation_status ?? "active") === "hidden" ? <Eye className="h-3.5 w-3.5 text-primary" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                  )}
                  <button onClick={() => handlePostModeration(p.id, "archived")} className="p-1.5 rounded hover:bg-white/10 transition-colors" title="В архив">
                    <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => handlePostModeration(p.id, "blocked")} className="p-1.5 rounded hover:bg-destructive/10 transition-colors" title="Заблокировать">
                    <Ban className="h-3.5 w-3.5 text-destructive" />
                  </button>
                  {p.status === "closed" && (
                    <button onClick={() => handleDeletePost(p.id)} className="p-1.5 rounded hover:bg-destructive/10 transition-colors" title="Удалить безопасно">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "apps" && (
          <div className="space-y-1">
            {allApps.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Нет откликов</p>}
            {allApps.map((a) => (
              <div key={a.id} className="premium-row flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{a.dj_profiles?.name ?? "DJ"}</span>
                    <span className="text-[10px] text-muted-foreground">→</span>
                    <span className="text-sm truncate text-muted-foreground">{a.venue_posts?.title ?? ""}</span>
                    <span className={`text-[10px] font-mono ${getApplicationStatusClass(a.status)}`}>{getApplicationStatusLabel(a.status)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {(canVenueAcceptApplication(a) || canVenueRejectApplication(a)) && (
                    <>
                      <button onClick={() => handleAppStatus(a.id, "accepted")} className="p-1.5 rounded hover:bg-primary/10 transition-colors"><Check className="h-3.5 w-3.5 text-primary" /></button>
                      <button onClick={() => handleAppStatus(a.id, "rejected")} className="p-1.5 rounded hover:bg-destructive/10 transition-colors"><X className="h-3.5 w-3.5 text-destructive" /></button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "invites" && (
          <div className="space-y-1">
            {allInvites.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Нет приглашений</p>}
            {allInvites.map((inv) => (
              <div key={inv.id} className="premium-row flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{(inv as any).venue_profiles?.name ?? "Venue"}</span>
                    <span className="text-[10px] text-muted-foreground">→</span>
                    <span className="text-sm truncate text-muted-foreground">{inv.dj_profiles?.name ?? "DJ"}</span>
                    <span className={`text-[10px] font-mono ${getApplicationStatusClass(inv.status)}`}>{getApplicationStatusLabel(inv.status)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{inv.venue_posts?.title ?? ""}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {inv.status === "new" && (
                    <>
                      <button onClick={() => handleInviteStatus(inv.id, "accepted")} className="p-1.5 rounded hover:bg-primary/10 transition-colors"><Check className="h-3.5 w-3.5 text-primary" /></button>
                      <button onClick={() => handleInviteStatus(inv.id, "rejected")} className="p-1.5 rounded hover:bg-destructive/10 transition-colors"><X className="h-3.5 w-3.5 text-destructive" /></button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;
