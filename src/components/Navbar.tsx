import { useState, useRef, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Bell, LogOut, User, Inbox, Menu, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
useNotifications,
markNotificationRead,
markAllNotificationsRead,
} from "@/hooks/useMarketplace";
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
if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
setShowNotifs(false);
}
};

if (showNotifs) {
document.addEventListener("mousedown", handler);
}

return () => document.removeEventListener("mousedown", handler);
}, [showNotifs]);

useEffect(() => {
setMobileMenu(false);
}, [location.pathname]);

const handleMarkRead = async (id: string) => {
await markNotificationRead(id);
refetch();
};

const handleMarkAll = async () => {
if (!user) return;
await markAllNotificationsRead(user.id);
refetch();
};

const handleSignOut = async () => {
await signOut();
localStorage.removeItem("djhub_dj_profile");
localStorage.removeItem("djhub_venue_profile");
toast.success("Вы вышли из системы");
navigate("/login");
};

const links = [
{ to: "/djs", label: "Диджеи" },
{ to: "/venues", label: "Заведения" },
{ to: "/posts", label: "Возможности" },
{ to: "/community", label: "Комьюнити чат" },
];

const isActive = (to: string) =>
location.pathname === to || location.pathname.startsWith(to + "/");

return (
<nav className="fixed left-0 right-0 top-0 z-50 border-b border-border/60 bg-background/78 shadow-lg shadow-black/10 backdrop-blur-xl">
<div className="container mx-auto flex h-14 min-w-0 items-center justify-between gap-3 px-4">
<Link to="/djs" className="shrink-0 text-xl font-bold tracking-tight">
<span className="text-primary neon-text">DJ</span>
<span className="text-foreground">HUB</span>
</Link>

<div className="hidden min-w-0 items-center gap-1 md:flex">
{links.map(({ to, label }) => (
<Link
key={to}
to={to}
onMouseEnter={() => preloadRoute(to)}
onFocus={() => preloadRoute(to)}
className={`flex min-w-0 items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
isActive(to)
? "bg-primary/10 text-primary"
: "text-muted-foreground hover:bg-white/5 hover:text-foreground"
}`}
>
{label}
</Link>
))}

{user && (
<Link
to="/inbox"
onMouseEnter={() => preloadRoute("/inbox")}
onFocus={() => preloadRoute("/inbox")}
className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${
isActive("/inbox")
? "bg-primary/10 text-primary"
: "text-muted-foreground hover:bg-white/5 hover:text-foreground"
}`}
>
<Inbox className="h-4 w-4 shrink-0" />
<span>Входящие</span>
</Link>
)}

{user && (
<div className="relative" ref={panelRef}>
<button
onClick={() => setShowNotifs((v) => !v)}
className="relative flex items-center justify-center rounded-lg px-2 py-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
title="Уведомления"
type="button"
>
<Bell className="h-4 w-4 shrink-0" />
{unreadCount > 0 && (
<span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
{unreadCount > 9 ? "9+" : unreadCount}
</span>
)}
</button>

{showNotifs && (
<div className="absolute right-0 top-full z-50 mt-2 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 shadow-2xl shadow-black/45 backdrop-blur-md">
<div className="flex min-w-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
<span className="text-sm font-semibold text-foreground">
Уведомления
</span>

{unreadCount > 0 && (
<button
onClick={handleMarkAll}
className="rounded-md px-2 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/10"
type="button"
>
Прочитать все
</button>
)}
</div>

<div className="max-h-72 overflow-y-auto p-2">
{notifications.length === 0 ? (
<div className="rounded-xl px-3 py-6 text-center text-sm text-muted-foreground">
Нет уведомлений
</div>
) : (
notifications.slice(0, 20).map((n) => (
<button
key={n.id}
onClick={() => handleMarkRead(n.id)}
className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/5 ${
n.is_read
? "text-muted-foreground"
: "bg-primary/5 text-foreground"
}`}
type="button"
>
<div className="flex min-w-0 items-start gap-2">
{!n.is_read && (
<span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
)}

<div className="min-w-0 flex-1">
<p className="break-words text-xs leading-relaxed">
{n.message}
</p>
<p className="mt-0.5 text-[10px] text-muted-foreground">
{new Date(n.created_at).toLocaleString("ru-RU")}
</p>
</div>
</div>
</button>
))
)}
</div>
</div>
)}
</div>
)}

{user ? (
<>
<Link
to="/profile"
onMouseEnter={() => preloadRoute("/profile")}
onFocus={() => preloadRoute("/profile")}
className={`flex min-w-0 items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
isActive("/profile")
? "bg-primary/10 text-primary"
: "text-muted-foreground hover:bg-white/5 hover:text-foreground"
}`}
>
Профиль
</Link>

<button
onClick={handleSignOut}
className="rounded-lg px-2 py-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
title="Выйти"
type="button"
>
<LogOut className="h-4 w-4 shrink-0" />
</button>
</>
) : (
<Link
to="/login"
className="flex min-w-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
>
<User className="h-4 w-4 shrink-0" />
<span>Войти</span>
</Link>
)}
</div>

<button
className="rounded-md p-1.5 text-muted-foreground hover:text-foreground md:hidden"
onClick={() => setMobileMenu((v) => !v)}
type="button"
>
{mobileMenu ? (
<X className="h-5 w-5" />
) : (
<Menu className="h-5 w-5" />
)}
</button>
</div>

{mobileMenu && (
<div className="space-y-1 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-xl md:hidden">
{links.map(({ to, label }) => (
<Link
key={to}
to={to}
onTouchStart={() => preloadRoute(to)}
className={`block rounded-md px-3 py-2 text-sm font-medium ${
isActive(to)
? "bg-primary/10 text-primary"
: "text-muted-foreground"
}`}
>
{label}
</Link>
))}

{user && (
<Link
to="/inbox"
className={`block rounded-md px-3 py-2 text-sm font-medium ${
isActive("/inbox")
? "bg-primary/10 text-primary"
: "text-muted-foreground"
}`}
>
Входящие
</Link>
)}

{user && (
<Link
to="/profile"
className={`block rounded-md px-3 py-2 text-sm font-medium ${
isActive("/profile")
? "bg-primary/10 text-primary"
: "text-muted-foreground"
}`}
>
Профиль
</Link>
)}

{user ? (
<button
onClick={handleSignOut}
className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-destructive"
type="button"
>
Выйти
</button>
) : (
<Link
to="/login"
className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground"
>
Войти
</Link>
)}
</div>
)}
</nav>
);
};

export default Navbar;