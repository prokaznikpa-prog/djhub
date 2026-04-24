import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { deleteVenuePost, updateVenuePost, useVenuePosts, type VenuePost } from "@/domains/posts/posts.hooks";
import { GIG_DURATION_OPTIONS, GIG_TYPE_FILTER_OPTIONS, GIG_STATUS_LABEL, type GigStatus, type GigType } from "@/lib/gigs";
import { getCityLabel } from "@/lib/geography";
import { MUSIC_STYLES } from "@/data/djhub-data";
import VenuePostCard from "@/components/VenuePostCard";
import CreatePostModal from "@/components/CreatePostModal";
import { Plus, Filter, SlidersHorizontal, Search, X } from "lucide-react";
import { toast } from "sonner";
import { setCachedValue } from "@/lib/requestCache";
import { calculateGigScore, getMatchReasons } from "@/utils/matching";
import { getCleanDisplayOptions } from "@/lib/displayLabels";

type OpportunityTab = "open" | "closed";

const PostListings = () => {
  const { djProfile, venueProfile } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterStyle, setFilterStyle] = useState("");
  const [filterType, setFilterType] = useState<"" | GigType>("");
  const [tab, setTab] = useState<OpportunityTab>("open");
  const [reopeningPost, setReopeningPost] = useState<VenuePost | null>(null);
  const deferredSearch = useDeferredValue(search);

  const { posts: rawPosts, loading, refetch, addPost, updatePost, removePost } = useVenuePosts({
    city: filterCity || undefined,
    style: filterStyle || undefined,
    status: tab,
    postType: filterType || undefined,
    venueId: tab === "closed" ? venueProfile?.id : undefined,
  });
  const cities = useMemo(() => getCleanDisplayOptions(rawPosts.map((p) => p.city), getCityLabel), [rawPosts]);

  const hasActiveFilters = !!(filterCity || filterStyle || filterType || search);

  const resetFilters = useCallback(() => {
    setSearch("");
    setFilterCity("");
    setFilterStyle("");
    setFilterType("");
  }, []);

  const scopedPosts = useMemo(() => {
    const statusScoped = rawPosts.filter((post) => post.status === tab);
    if (tab !== "closed") return statusScoped;
    if (!venueProfile) return [];
    return statusScoped.filter((post) => post.venue_id === venueProfile.id);
  }, [rawPosts, tab, venueProfile?.id]);

  const posts = useMemo(() => {
    let list = scopedPosts;
    if (deferredSearch) {
      const q = deferredSearch.toLowerCase();
      list = scopedPosts.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        getCityLabel(p.city).toLowerCase().includes(q) ||
        p.music_styles.some((s) => s.toLowerCase().includes(q))
      );
    }

    if (!djProfile || tab !== "open") return list;

    return list
      .map((post) => ({ post, score: calculateGigScore(post, djProfile) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.post.created_at).getTime() - new Date(a.post.created_at).getTime();
      })
      .map(({ post }) => post);
  }, [scopedPosts, deferredSearch, djProfile, tab]);

  const selectCls = "djhub-select";

  return (
    <div className="min-h-screen pt-20 pb-12">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold">
            <span className="text-primary neon-text">Выступления и кастинги</span>
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                showFilters ? "border-primary/40 bg-primary/10 text-primary" : "border-white/10 bg-white/5 text-muted-foreground hover:border-primary/30 hover:text-foreground"
              }`}
            >
              <Filter className="h-3 w-3" /> Фильтры
            </button>
            {venueProfile && (
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Plus className="h-3.5 w-3.5" /> Создать
              </button>
            )}
          </div>
        </div>

        <div className="premium-surface mb-4 inline-flex p-1">
          {(["open", "closed"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              disabled={value === "closed" && !venueProfile}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                tab === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {value === "open" ? "Открытые" : "Закрытые"}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Поиск по названию, городу или стилю..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="premium-input w-full !pl-14 pr-9 py-2"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {showFilters && (
          <div className="premium-surface mb-5 flex flex-wrap items-center gap-2 px-4 py-3">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            <select className={selectCls} value={filterCity} onChange={(e) => setFilterCity(e.target.value)}>
              <option value="">Все города</option>
              {cities.map((c) => <option key={c} value={c}>{getCityLabel(c)}</option>)}
            </select>
            <select className={selectCls} value={filterStyle} onChange={(e) => setFilterStyle(e.target.value)}>
              <option value="">Все стили</option>
              {MUSIC_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className={selectCls} value={filterType} onChange={(e) => setFilterType(e.target.value as any)}>
              <option value="">Все типы</option>
              {GIG_TYPE_FILTER_OPTIONS.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            {hasActiveFilters && (
              <button onClick={resetFilters} className="text-[10px] text-primary hover:underline ml-1">
                Сбросить
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-64 animate-pulse rounded-2xl border border-white/5 bg-[#171a20] shadow-lg" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <p className="text-muted-foreground text-sm">{tab === "open" ? "Нет активных публикаций" : "Нет закрытых публикаций"}</p>
            {hasActiveFilters && (
              <button onClick={resetFilters} className="text-xs text-primary hover:underline">
                Сбросить фильтры
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {posts.map((post, i) => (
              <div key={post.id} onMouseEnter={() => setCachedValue(`post:${post.id}`, post)} onFocus={() => setCachedValue(`post:${post.id}`, post)}>
                {tab === "closed" && venueProfile ? (
                  <ClosedPostCard
                    post={post}
                    onReopen={() => setReopeningPost(post)}
                    onDelete={async () => {
                      const { error, action } = await deleteVenuePost(post.id);
                      if (error) {
                        toast.error(error.message || "Не удалось удалить публикацию");
                        return;
                      }
                      if (action !== "deleted") {
                        toast.error("Публикация не была удалена");
                        return;
                      }
                      toast.success("Публикация удалена");
                      removePost(post.id);
                    }}
                  />
                ) : (
                  <VenuePostCard
                    post={post}
                    index={i}
                    isBestMatch={!!djProfile && tab === "open" && i < 3}
                    matchReasons={djProfile && tab === "open" ? getMatchReasons(post, djProfile) : []}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && venueProfile && (
        <CreatePostModal
          venueId={venueProfile.id}
          venueCity={venueProfile.city}
          onClose={() => setShowCreate(false)}
          onCreated={(post) => { if (post && tab === "open") addPost(post); else refetch(); setShowCreate(false); }}
        />
      )}
      {reopeningPost && (
        <ReopenPostModal
          post={reopeningPost}
          onClose={() => setReopeningPost(null)}
          onSaved={(updates) => {
            updatePost(reopeningPost.id, updates);
            setReopeningPost(null);
          }}
        />
      )}
    </div>
  );
};

const ClosedPostCard = ({ post, onReopen, onDelete }: { post: VenuePost; onReopen: () => void; onDelete: () => void }) => (
  <div className="premium-surface p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{post.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{post.budget || "Бюджет не указан"} · {post.event_date || "Дата не указана"} · {post.start_time || "Время не указано"}</p>
        <span className="mt-2 inline-block rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">{GIG_STATUS_LABEL.closed}</span>
      </div>
      <div className="flex shrink-0 gap-2">
        <button onClick={onReopen} className="rounded-lg bg-primary px-3 py-1.5 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
          Обновить и открыть
        </button>
        <button onClick={onDelete} className="rounded-lg border border-destructive/30 px-3 py-1.5 text-[10px] font-semibold text-destructive hover:bg-destructive/10 transition-colors">
          Удалить
        </button>
      </div>
    </div>
  </div>
);

const ReopenPostModal = ({ post, onClose, onSaved }: { post: VenuePost; onClose: () => void; onSaved: (updates: Partial<VenuePost>) => void }) => {
  const [budget, setBudget] = useState(post.budget ?? "");
  const [eventDate, setEventDate] = useState(post.event_date ?? "");
  const [startTime, setStartTime] = useState(post.start_time ?? "");
  const [duration, setDuration] = useState(post.duration ?? "");
  const [saving, setSaving] = useState(false);
  const canSubmit = post.post_type === "gig"
    ? !!(budget.trim() && eventDate && startTime && duration)
    : !!(eventDate && startTime);
  const fieldCls = "premium-input w-full";

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error("Заполните бюджет, дату, время и длительность");
      return;
    }

    const updates: Partial<VenuePost> = {
      budget: budget.trim(),
      event_date: eventDate,
      start_time: startTime,
      duration: post.post_type === "gig" ? duration : post.duration,
      deadline: post.post_type === "casting" ? eventDate : post.deadline,
      status: "open",
    };

    setSaving(true);
    const { data, error } = await updateVenuePost(post.id, updates);
    setSaving(false);

    if (error) {
      toast.error("Не удалось открыть публикацию");
      return;
    }

    toast.success("Публикация снова открыта");
    onSaved(data ?? updates);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 px-4 backdrop-blur-md">
      <div className="profile-section w-full max-w-lg premium-surface p-5" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Открыть публикацию</h2>
            <p className="text-xs text-muted-foreground">Обновите условия перед повторной публикацией</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-white/10 bg-background/45 p-1.5 text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Бюджет</label>
            <input className={fieldCls} value={budget} onChange={(event) => setBudget(event.target.value.replace(/\D/g, ""))} inputMode="numeric" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(160px,1.2fr)_minmax(120px,1fr)_minmax(0,1fr)]">
            <div className="w-full">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Дата</label>
              <input className={`${fieldCls} min-w-[150px] pr-10`} type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
            </div>
            <div className="w-full">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Время</label>
              <input className={fieldCls} type="time" min="00:00" max="23:59" step="300" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </div>
            <div className="w-full">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Длительность</label>
              <select className="djhub-select w-full text-sm" value={duration} onChange={(event) => setDuration(event.target.value)}>
                <option value="">Выбрать</option>
                {GIG_DURATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          </div>
          <button onClick={handleSubmit} disabled={saving || !canSubmit} className="btn-glow w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
            {saving ? "Открываем..." : "Открыть публикацию"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PostListings;
