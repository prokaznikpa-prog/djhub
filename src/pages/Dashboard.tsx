import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  useApplicationsForDj, useApplicationsForVenue,
} from "@/domains/applications/applications.hooks";
import {
  useInvitationsForDj, useInvitationsForVenue,
} from "@/domains/invitations/invitations.hooks";
import {
  useVenuePostsByVenue, useVenuePosts,
} from "@/domains/posts/posts.hooks";
import { getGigTypeLabel, GIG_STATUS_LABEL } from "@/lib/gigs";
import { getApplicationStatusClass, getApplicationStatusLabel } from "@/lib/applications";
import { getCityLabel } from "@/lib/geography";
import { Send, Mail, FileText, Sparkles, User } from "lucide-react";

const Dashboard = () => {
  const { djProfile, venueProfile } = useAuth();

  return (
    <div className="min-h-screen pt-20 pb-12">
      <div className="container mx-auto px-4 max-w-2xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">
            Добро пожаловать в <span className="text-primary neon-text">DJHUB</span>
          </h1>
          <p className="text-muted-foreground">Ваша площадка для поиска DJ и выступлений</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link to="/profile" className="btn-glow flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
            <User className="h-3.5 w-3.5" /> Мой профиль
          </Link>
          <Link to="/djs" className="premium-row px-5 py-2.5 text-sm font-medium text-secondary-foreground hover:text-foreground">Найти DJ</Link>
          <Link to="/posts" className="premium-row px-5 py-2.5 text-sm font-medium text-secondary-foreground hover:text-foreground">Выступления и кастинги</Link>
          <Link to="/inbox" className="premium-row px-5 py-2.5 text-sm font-medium text-secondary-foreground hover:text-foreground">Входящие</Link>
          <Link to="/venues" className="premium-row px-5 py-2.5 text-sm font-medium text-secondary-foreground hover:text-foreground">Заведения</Link>
        </div>

        {!djProfile && !venueProfile && (
          <div className="premium-surface space-y-3 p-8 text-center">
            <p className="text-muted-foreground">Создайте профиль, чтобы получить доступ ко всем возможностям</p>
            <Link to="/register" className="inline-block rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
              Создать профиль
            </Link>
          </div>
        )}

        {djProfile && <DjDashboard djProfile={djProfile} />}
        {venueProfile && <VenueDashboard venueProfile={venueProfile} />}
      </div>
    </div>
  );
};

const EmptySection = ({ text, linkTo, linkLabel }: { text: string; linkTo?: string; linkLabel?: string }) => (
  <div className="premium-surface p-4 text-center">
    <p className="text-sm text-muted-foreground">{text}</p>
    {linkTo && <Link to={linkTo} className="mt-1 inline-block text-xs font-semibold text-primary hover:underline">{linkLabel}</Link>}
  </div>
);

const DjDashboard = ({ djProfile }: { djProfile: any }) => {
  const { apps } = useApplicationsForDj(djProfile.id);
  const { invites } = useInvitationsForDj(djProfile.id);
  const { posts: recommended, loading: recommendedLoading } = useVenuePosts({ status: "open" });

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-lg font-bold flex items-center gap-2"><Send className="h-4 w-4 text-primary" /> Мои отклики</h2>
        {apps.length === 0 ? (
          <EmptySection text="Вы ещё не откликались на выступления и кастинги" linkTo="/posts" linkLabel="Найти выступления →" />
        ) : (
          <div className="space-y-1">
            {apps.slice(0, 5).map((a: any) => (
              <div key={a.id} className="premium-row flex items-center justify-between px-4 py-2">
                <div>
                  <span className="text-sm font-semibold">{a.venue_posts?.title ?? "Публикация"}</span>
                  <div className="text-xs text-muted-foreground">{getGigTypeLabel(a.venue_posts?.post_type)}</div>
                </div>
                <span className={`text-[10px] font-mono ${getApplicationStatusClass(a.status)}`}>{getApplicationStatusLabel(a.status)}</span>
              </div>
            ))}
            {apps.length > 5 && <Link to="/inbox" className="text-xs text-primary hover:underline">Показать все →</Link>}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> Приглашения</h2>
        {invites.length === 0 ? (
          <EmptySection text="Нет приглашений — площадки смогут пригласить вас напрямую" />
        ) : (
          <div className="space-y-1">
            {invites.slice(0, 5).map((inv: any) => (
              <div key={inv.id} className="premium-row flex items-center justify-between px-4 py-2">
                <div>
                  <span className="text-sm font-semibold">{inv.venue_profiles?.name ?? "Площадка"}</span>
                  <div className="text-xs text-muted-foreground">{inv.venue_posts?.title ?? ""}</div>
                </div>
                <span className={`text-[10px] font-mono ${getApplicationStatusClass(inv.status)}`}>{getApplicationStatusLabel(inv.status)}</span>
              </div>
            ))}
            {invites.length > 5 && <Link to="/inbox" className="text-xs text-primary hover:underline">Показать все →</Link>}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Рекомендуемые выступления</h2>
        {recommendedLoading ? (
          <div className="space-y-1">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-xl border border-white/5 bg-[#171a20]" />
            ))}
          </div>
        ) : recommended.length === 0 ? (
          <EmptySection text="Пока нет открытых возможностей" />
        ) : (
          <div className="space-y-1">
            {recommended.slice(0, 4).map((p: any) => (
              <Link key={p.id} to={`/post/${p.id}`} className="premium-row flex items-center justify-between px-4 py-2">
                <div>
                  <span className="text-sm font-semibold">{p.title}</span>
                  <div className="text-xs text-muted-foreground">{getGigTypeLabel(p.post_type)} · {getCityLabel(p.city)}</div>
                </div>
                {p.budget && <span className="text-xs font-mono text-primary">{p.budget}</span>}
              </Link>
            ))}
            <Link to="/posts" className="text-xs text-primary hover:underline">Все выступления →</Link>
          </div>
        )}
      </section>
    </div>
  );
};

const VenueDashboard = ({ venueProfile }: { venueProfile: any }) => {
  const { posts, loading: postsLoading } = useVenuePostsByVenue(venueProfile.id);
  const { apps } = useApplicationsForVenue(venueProfile.id);
  const { invites } = useInvitationsForVenue(venueProfile.id);
  const openPosts = posts.filter((post) => post.status === "open");

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-lg font-bold flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Мои публикации</h2>
        {postsLoading ? (
          <div className="space-y-1">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-xl border border-white/5 bg-[#171a20]" />
            ))}
          </div>
        ) : openPosts.length === 0 ? (
          <EmptySection text="Нет публикаций — создайте первое выступление, кастинг или резидентство для DJ" linkTo="/posts" linkLabel="Создать публикацию →" />
        ) : (
          <div className="space-y-1">
            {openPosts.slice(0, 5).map((p: any) => (
              <div key={p.id} className="premium-row flex items-center justify-between px-4 py-2">
                <div>
                  <span className="text-sm font-semibold">{p.title}</span>
                  <div className="text-xs text-muted-foreground">{getGigTypeLabel(p.post_type)} · {p.status === "open" ? GIG_STATUS_LABEL.open : GIG_STATUS_LABEL.closed}</div>
                </div>
                <Link to={`/post/${p.id}`} className="text-[10px] text-primary hover:underline">Открыть</Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold flex items-center gap-2"><Send className="h-4 w-4 text-primary" /> Отклики</h2>
        {apps.length === 0 ? (
          <EmptySection text="Нет откликов на ваши публикации" />
        ) : (
          <div className="space-y-1">
            {apps.slice(0, 5).map((a: any) => (
              <div key={a.id} className="premium-row flex items-center justify-between px-4 py-2">
                <div>
                  <span className="text-sm font-semibold">{a.dj_profiles?.name ?? "DJ"}</span>
                  <div className="text-xs text-muted-foreground">{a.venue_posts?.title ?? ""}</div>
                </div>
                <span className={`text-[10px] font-mono ${getApplicationStatusClass(a.status)}`}>{getApplicationStatusLabel(a.status)}</span>
              </div>
            ))}
            {apps.length > 5 && <Link to="/inbox" className="text-xs text-primary hover:underline">Показать все →</Link>}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> Мои приглашения DJ</h2>
        {invites.length === 0 ? (
          <EmptySection text="Вы ещё не приглашали DJ" linkTo="/djs" linkLabel="Найти DJ →" />
        ) : (
          <div className="space-y-1">
            {invites.slice(0, 5).map((inv: any) => (
              <div key={inv.id} className="premium-row flex items-center justify-between px-4 py-2">
                <div>
                  <span className="text-sm font-semibold">{inv.dj_profiles?.name ?? "DJ"}</span>
                  <div className="text-xs text-muted-foreground">{inv.venue_posts?.title ?? ""}</div>
                </div>
                <span className={`text-[10px] font-mono ${getApplicationStatusClass(inv.status)}`}>{getApplicationStatusLabel(inv.status)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Dashboard;
