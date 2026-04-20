import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { createApplication, checkApplied, createNotification } from "@/hooks/useMarketplace";
import type { VenuePost } from "@/hooks/useMarketplace";
import { GIG_STATUS_LABEL, getGigTypeBadgeClass, getGigTypeLabel, isOpenGig } from "@/lib/gigs";
import { getCityLabel } from "@/lib/geography";
import { ArrowLeft, MapPin, Clock, Music, Calendar, Briefcase, Send, Tag } from "lucide-react";
import { toast } from "sonner";
import { cachedRequest, getCachedValue, setCachedValue } from "@/lib/requestCache";

const PostDetail = () => {
  const { id } = useParams();
  const { user, djProfile } = useAuth();
  const cachedPost = id ? getCachedValue<(VenuePost & { venue_profiles?: { name?: string | null; user_id?: string | null } | null })>(`post:${id}`) : null;
  const [post, setPost] = useState<VenuePost | null>(() => cachedPost);
  const [venueName, setVenueName] = useState(() => cachedPost?.venue_profiles?.name ?? "");
  const [venueUserId, setVenueUserId] = useState<string | null>(() => cachedPost?.venue_profiles?.user_id ?? null);
  const [applied, setApplied] = useState(false);
  const [loading, setLoading] = useState(() => !cachedPost);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const cacheKey = `post:${id}`;
      const cached = getCachedValue<(VenuePost & { venue_profiles?: { name?: string | null; user_id?: string | null } | null })>(cacheKey);
      if (cached) {
        setPost(cached);
        setVenueName(cached.venue_profiles?.name ?? "");
        setVenueUserId(cached.venue_profiles?.user_id ?? null);
        setLoading(false);
      }
      const data = await cachedRequest<(VenuePost & { venue_profiles?: { name?: string | null; user_id?: string | null } | null }) | null>(cacheKey, async () => {
        const { data, error } = await supabase.from("venue_posts").select("*, venue_profiles(name, user_id)").eq("id", id).single();
        if (error) {
          console.error("Failed to load post", error);
          return null;
        }
        return data as any;
      });
      if (data) {
        setCachedValue(cacheKey, data as any);
        setPost(data as any);
        setVenueName((data as any).venue_profiles?.name ?? "");
        setVenueUserId((data as any).venue_profiles?.user_id ?? null);
      }
      if (djProfile && data) {
        const isApplied = await checkApplied(djProfile.id, id);
        setApplied(isApplied);
      }
      setLoading(false);
    };
    fetchData();
  }, [id, djProfile?.id]);

  if (loading) return <div className="min-h-screen pt-20 flex items-center justify-center"><p className="text-muted-foreground text-sm">Загрузка...</p></div>;
  if (!post) return (
    <div className="min-h-screen pt-20 flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-muted-foreground">Публикация не найдена</p>
        <Link to="/posts" className="text-sm text-primary hover:underline">← Назад</Link>
      </div>
    </div>
  );

  const isClosed = !isOpenGig(post);

  const handleApply = async () => {
    if (!djProfile) {
      toast.error("Сначала зарегистрируйтесь как DJ");
      return;
    }
    if (!user) {
      toast.error("Войдите в аккаунт");
      return;
    }
    if (applied) return;
    const { error, alreadyApplied } = await createApplication(djProfile.id, post.id);
    if (alreadyApplied) {
      toast.error("Вы уже откликнулись");
      setApplied(true);
      return;
    }
    if (error) {
      if (error.message.includes("duplicate")) {
        toast.error("Вы уже откликнулись");
        setApplied(true);
      } else {
        toast.error("Ошибка: " + error.message);
      }
      return;
    }
    setApplied(true);
    toast.success("Отклик отправлен!");

    // Create notifications
    await createNotification(user.id, "application", `Вы откликнулись на "${post.title}"`, post.id);
    if (venueUserId) {
      await createNotification(venueUserId, "application", `Новый отклик от ${djProfile.name} на "${post.title}"`, post.id);
    }
  };

  return (
    <div className="min-h-screen pt-20 pb-12">
      <div className="container mx-auto max-w-2xl px-4">
        <Link to="/posts" className="mb-6 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-background/35 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Назад
        </Link>
        <div className="premium-surface overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-foreground">{post.title}</h1>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${getGigTypeBadgeClass(post.post_type)}`}>
                  {getGigTypeLabel(post.post_type)}
                </span>
                <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${isClosed ? "border border-white/10 bg-white/5 text-muted-foreground" : "bg-primary/15 text-primary"}`}>
                  {isClosed ? GIG_STATUS_LABEL.closed : GIG_STATUS_LABEL.open}
                </span>
              </div>
            </div>

            {venueName && <p className="text-sm text-muted-foreground">Площадка: <span className="font-semibold text-foreground">{venueName}</span></p>}

            <div className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="h-4 w-4" /> {getCityLabel(post.city)}</div>

            <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-4 text-sm">
              {post.event_date && <div className="premium-row p-3 text-muted-foreground"><Calendar className="mb-1 h-4 w-4 text-primary" /><span>{post.event_date}</span></div>}
              {post.start_time && <div className="premium-row p-3 text-muted-foreground"><Clock className="mb-1 h-4 w-4 text-primary" /><span>{post.start_time}{post.duration ? ` · ${post.duration}` : ""}</span></div>}
              {post.budget && <div className="rounded-xl border border-primary/25 bg-primary/10 p-3 font-mono text-primary"><Tag className="mb-1 h-4 w-4" /><span>{post.budget}</span></div>}
              {post.frequency && <div className="premium-row p-3 text-muted-foreground"><Briefcase className="mb-1 h-4 w-4 text-primary" /><span>{post.frequency}</span></div>}
            </div>

            {post.music_styles.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {post.music_styles.map((s) => (
                  <span key={s} className="premium-chip">{s}</span>
                ))}
              </div>
            )}

            {post.description && <p className="border-t border-border/60 pt-4 text-sm leading-relaxed text-secondary-foreground">{post.description}</p>}

            {post.post_type === "casting" && post.requirements && (
              <div className="pt-2 border-t border-border">
                <h3 className="text-sm font-semibold mb-1">Требования</h3>
                <p className="text-sm text-muted-foreground">{post.requirements}</p>
                {post.portfolio_required && <p className="text-xs text-amber-400 mt-1">📎 Портфолио обязательно</p>}
                {post.deadline && <p className="text-xs text-muted-foreground mt-1">Дедлайн: {post.deadline}</p>}
              </div>
            )}

            {post.post_type === "residency" && (
              <div className="pt-2 border-t border-border text-sm text-muted-foreground space-y-1">
                {post.schedule && <p>Расписание: {post.schedule}</p>}
                {post.frequency && <p>Частота: {post.frequency}</p>}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              {isClosed ? (
                <div className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 text-center text-sm font-medium text-muted-foreground">Набор завершён</div>
              ) : !user ? (
                <Link to="/signup" className="btn-glow flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                  <Send className="h-4 w-4" /> Войдите, чтобы откликнуться
                </Link>
              ) : !djProfile ? (
                <div className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 text-center text-sm text-muted-foreground">Только DJ могут откликаться</div>
              ) : applied ? (
                <div className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 py-2.5 text-center text-sm font-medium text-primary">
                  <Send className="h-4 w-4" /> Вы уже откликнулись
                </div>
              ) : (
                <button
                  onClick={handleApply}
                  className="btn-glow flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Send className="h-4 w-4" /> Откликнуться
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostDetail;
