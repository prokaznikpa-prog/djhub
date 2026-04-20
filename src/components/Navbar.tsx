import { useState, useRef, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Bell, LogOut, User, Inbox, Menu, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications, markNotificationRead, markAllNotificationsRead } from "@/hooks/useMarketplace";
import { preloadRoute } from "@/lib/routePreload";

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { notifications, unreadCount, refetch } = useNotifications(user?.id);
  const [showNotifs, setShowNotifs] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setShowNotifs(false);
    };
    if (showNotifs) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNotifs]);

  useEffect(() => { setMobileMenu(false); }, [location.pathname]);

  const handleMarkRead = async (id: string) => { await markNotificationRead(id); refetch(); };
  const handleMarkAll = async () => { if (user) { await markAllNotificationsRead(user.id); refetch(); } };

  const links = [
    { to: "/djs", label: "Диджеи" },
    { to: "/venues", label: "Заведения" },
    { to: "/posts", label: "Возможности" },
    { to: "/community", label: "Комьюнити чат" },
  ];

  const handleSignOut = async () => {
    await signOut();
    localStorage.removeItem("djhub_dj_profile");
    localStorage.removeItem("djhub_venue_profile");
    toast.success("Вы вышли из системы");
    navigate("/login");
  };

  const isActive = (to: string) => location.pathname === to || location.pathname.startsWith(to + "/");

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/60 bg-background/78 shadow-lg shadow-black/10 backdrop-blur-xl">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link to="/djs" className="text-xl font-bold tracking-tight">
          <span className="text-primary neon-text">DJ</span>
          <span className="text-foreground">HUB</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {links.map(({ to, label }) => (
            <Link key={to} to={to} onMouseEnter={() => preloadRoute(to)} onFocus={() => preloadRoute(to)} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${isActive(to) ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}>
              {label}
            </Link>
          ))}
          {user && (
            <Link to="/inbox" onMouseEnter={() => preloadRoute("/inbox")} onFocus={() => preloadRoute("/inbox")} className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${isActive("/inbox") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}>
              <Inbox className="h-3.5 w-3.5" />
              <span>Входящие</span>
            </Link>
          )}
          {user && (
            <div className="relative" ref={panelRef}>
              <button onClick={() => setShowNotifs((v) => !v)} className="relative rounded-lg px-2 py-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground px-1">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              {showNotifs && (
                <div className="premium-surface profile-section absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                    <span className="text-sm font-semibold text-foreground">Уведомления</span>
                    {unreadCount > 0 && <button onClick={handleMarkAll} className="rounded-md px-2 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/10">Прочитать все</button>}
                  </div>
                  <div className="max-h-72 overflow-y-auto p-1">
                    {notifications.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">Нет уведомлений</p>
                    ) : notifications.slice(0, 20).map((n) => (
                      <button key={n.id} onClick={() => handleMarkRead(n.id)} className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/5 ${n.is_read ? "text-muted-foreground" : "bg-primary/5 text-foreground"}`}>
                        <div className="flex items-start gap-2">
                          {!n.is_read && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                          <div className="min-w-0">
                            <p className="text-xs leading-relaxed">{n.message}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(n.created_at).toLocaleString("ru-RU")}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {user ? (
            <>
              <Link to="/profile" onMouseEnter={() => preloadRoute("/profile")} onFocus={() => preloadRoute("/profile")} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${isActive("/profile") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}>
                Профиль
              </Link>
              <button onClick={handleSignOut} className="rounded-lg px-2 py-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground" title="Выйти">
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <Link to="/login" className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
              <User className="h-3.5 w-3.5" /> Войти
            </Link>
          )}
        </div>

        {/* Mobile hamburger */}
        <button className="md:hidden rounded-md p-1.5 text-muted-foreground hover:text-foreground" onClick={() => setMobileMenu((v) => !v)}>
          {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileMenu && (
        <div className="md:hidden border-t border-border bg-background/95 backdrop-blur-xl px-4 py-3 space-y-1">
          {links.map(({ to, label }) => (
            <Link key={to} to={to} onTouchStart={() => preloadRoute(to)} className={`block rounded-md px-3 py-2 text-sm font-medium ${isActive(to) ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
              {label}
            </Link>
          ))}
          {user && <Link to="/inbox" className={`block rounded-md px-3 py-2 text-sm font-medium ${isActive("/inbox") ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>Входящие</Link>}
          {user && <Link to="/profile" className={`block rounded-md px-3 py-2 text-sm font-medium ${isActive("/profile") ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>Профиль</Link>}
          {user ? (
            <button onClick={handleSignOut} className="block w-full text-left rounded-md px-3 py-2 text-sm font-medium text-destructive">Выйти</button>
          ) : (
            <Link to="/login" className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground">Войти</Link>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
