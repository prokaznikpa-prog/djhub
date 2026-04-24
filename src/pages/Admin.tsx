import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
useAllApplications,
useAllInvitations,
useAllVenuePosts,
} from "@/domains/admin/admin.hooks";
import { updateApplicationStatus } from "@/domains/applications/applications.hooks";
import { updateInvitationStatus } from "@/domains/invitations/invitations.hooks";
import { deleteVenuePost } from "@/domains/posts/posts.hooks";
import {
FEEDBACK_STATUS_LABELS,
FEEDBACK_TYPE_LABELS,
updateFeedbackStatus,
useAllFeedback,
type FeedbackStatus,
} from "@/domains/feedback/feedback.hooks";
import { useAuth } from "@/hooks/useAuth";
import {
Trash2,
Eye,
EyeOff,
ArrowLeft,
MessageCircle,
Check,
X,
Archive,
Ban,
ImageOff,
Pencil,
} from "lucide-react";
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
import { validateDjPrice, validateProfileName } from "@/lib/profileNameValidation";

const statusLabel: Record<string, string> = {
active: "Активен",
hidden: "Скрыт",
blocked: "Заблокирован",
archived: "Архив",
closed: "Закрыт",
open: "Открыт",
};

const statusColor: Record<string, string> = {
active: "text-primary",
hidden: "text-muted-foreground",
blocked: "text-destructive",
archived: "text-muted-foreground",
closed: "text-destructive",
open: "text-primary",
};

const moderationLabel: Record<string, string> = {
active: "Виден",
hidden: "Скрыт",
archived: "Архив",
blocked: "Блок",
};

const trustedButtonClass = (trusted: boolean) =>
trusted
? "rounded p-1.5 text-white shadow-sm shadow-primary/20 transition-transform hover:scale-105 disabled:opacity-50 bg-[linear-gradient(135deg,#ff6a3d_0%,#ff3b2f_100%)]"
: "rounded bg-white/10 p-1.5 text-muted-foreground transition-transform hover:scale-105 hover:bg-white/15 disabled:opacity-50";

const UI_LABELS = {
verified: "Подтверждён",
trusted: "Надёжный",
issueTrusted: "Выдать статус «Надёжный»",
removeTrusted: "Снять статус «Надёжный»",
trustedGrantedDj: "DJ получил статус «Надёжный»",
trustedRevokedDj: "Статус «Надёжный» снят с DJ",
trustedGrantedVenue: "Заведение получило статус «Надёжный»",
trustedRevokedVenue: "Статус «Надёжный» снят с заведения",
} as const;

type ProfileStatus = "active" | "hidden" | "blocked" | "archived";
type PostModerationStatus = "active" | "hidden" | "archived" | "blocked";
type AdminTab = "djs" | "venues" | "posts" | "apps" | "invites" | "feedback";
type AdminEditProfileState =
| { kind: "dj"; profile: Tables<"dj_profiles"> }
| { kind: "venue"; profile: Tables<"venue_profiles"> }
| null;

const normalizePostStatus = (status: unknown): "open" | "closed" =>
String(status) === "open" ? "open" : "closed";

const normalizeModerationStatus = (status: unknown): PostModerationStatus =>
status === "hidden" || status === "archived" || status === "blocked" ? status : "active";

const ADMIN_EMAILS = ["volin.kolin@mail.ru"];

const Admin = () => {
const navigate = useNavigate();
const { user } = useAuth();

const [tab, setTab] = useState<AdminTab>("djs");
const [djItems, setDjItems] = useState<Tables<"dj_profiles">[]>([]);
const [venueItems, setVenueItems] = useState<Tables<"venue_profiles">[]>([]);
const [loadingProfiles, setLoadingProfiles] = useState(true);
const [actionKey, setActionKey] = useState<string | null>(null);
const [editingProfile, setEditingProfile] = useState<AdminEditProfileState>(null);
const [editName, setEditName] = useState("");
const [editPrice, setEditPrice] = useState("");
const isAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());

const { posts: allPosts, removePost, updatePost } = useAllVenuePosts();
const { apps: allApps, refetch: refetchApps } = useAllApplications();
const { invites: allInvites, refetch: refetchInvites } = useAllInvitations();
const { feedback: allFeedback, loading: loadingFeedback, setFeedback } = useAllFeedback(isAdmin);

const loadProfiles = useCallback(async () => {
setLoadingProfiles(true);

const [djRes, venueRes] = await Promise.all([
supabase.from("dj_profiles").select("*").order("created_at", { ascending: false }),
supabase.from("venue_profiles").select("*").order("created_at", { ascending: false }),
]);

if (djRes.error) {
toast.error("Не удалось загрузить DJ для админки");
} else {
setDjItems(djRes.data ?? []);
}

if (venueRes.error) {
toast.error("Не удалось загрузить заведения для админки");
} else {
setVenueItems(venueRes.data ?? []);
}

setLoadingProfiles(false);
}, []);

useEffect(() => {
if (!user) return;

if (!isAdmin) {
toast.error("Нет доступа к админ панели");
navigate("/djs");
return;
}

loadProfiles();
}, [user, isAdmin, navigate, loadProfiles]);

const getDjDependencyCount = async (id: string) => {
const [apps, invites, bookings, chats] = await Promise.all([
supabase.from("applications").select("id", { count: "exact", head: true }).eq("dj_id", id),
supabase.from("invitations").select("id", { count: "exact", head: true }).eq("dj_id", id),
supabase.from("bookings").select("id", { count: "exact", head: true }).eq("dj_id", id),
(supabase.from("chat_threads" as any) as any)
  .select("id", { count: "exact", head: true })
  .eq("dj_id", id),
]);

const error = apps.error || invites.error || bookings.error || chats.error;

return {
count:
(apps.count ?? 0) +
(invites.count ?? 0) +
(bookings.count ?? 0) +
(chats.count ?? 0),
error,
};
};

const getVenueDependencyCount = async (id: string) => {
const [posts, invites, bookings, chats] = await Promise.all([
supabase.from("venue_posts").select("id", { count: "exact", head: true }).eq("venue_id", id),
supabase.from("invitations").select("id", { count: "exact", head: true }).eq("venue_id", id),
supabase.from("bookings").select("id", { count: "exact", head: true }).eq("venue_id", id),
(supabase.from("chat_threads" as any) as any)
  .select("id", { count: "exact", head: true })
  .eq("venue_id", id),
]);

const error = posts.error || invites.error || bookings.error || chats.error;

return {
count:
(posts.count ?? 0) +
(invites.count ?? 0) +
(bookings.count ?? 0) +
(chats.count ?? 0),
error,
};
};

const handleDjStatus = async (dj: Tables<"dj_profiles">, status: ProfileStatus) => {
const key = `dj-${dj.id}-${status}`;
setActionKey(key);

const { data, error } = await supabase
.from("dj_profiles")
.update({ status })
.eq("id", dj.id)
.select("id, status")
.maybeSingle();

setActionKey(null);

if (error) {
toast.error("Не удалось обновить статус DJ");
return;
}

if (!data) {
toast.error("Статус DJ не сохранился. Проверь права/RLS.");
return;
}

setDjItems((prev) =>
prev.map((item) =>
item.id === dj.id ? { ...item, status: data.status as ProfileStatus } : item
)
);

toast.success(
status === "active"
? "DJ снова виден в маркетплейсе"
: "Статус DJ обновлён"
);
};

const handleDeleteDj = async (id: string) => {
if (!confirm("Удалить DJ навсегда? Это доступно только без связанной истории.")) return;

const deps = await getDjDependencyCount(id);
if (deps.error) {
toast.error("Не удалось проверить связанные данные DJ");
return;
}

if (deps.count > 0) {
toast.error("Нельзя удалить DJ: есть связанная история. Используйте скрытие, архив или блокировку.");
return;
}

const { error, count } = await supabase
.from("dj_profiles")
.delete({ count: "exact" })
.eq("id", id);

if (error) {
toast.error("Нельзя удалить DJ: есть связанные данные. Используйте архив или блокировку.");
return;
}

if (count === 0) {
toast.error("Не удалось удалить — нет прав администратора");
return;
}

setDjItems((prev) => prev.filter((d) => d.id !== id));
toast.success("DJ удалён");
};

const handleToggleDj = async (dj: Tables<"dj_profiles">) => {
await handleDjStatus(dj, dj.status === "active" ? "hidden" : "active");
};

const handleToggleDjTrusted = async (dj: Tables<"dj_profiles">) => {
const currentTrusted = Boolean((dj as any).is_trusted);
const nextTrusted = !currentTrusted;
const key = `dj-${dj.id}-trusted`;
setActionKey(key);

const { data, error } = await supabase
.from("dj_profiles")
.update({ is_trusted: nextTrusted } as any)
.eq("id", dj.id)
.select("id, is_trusted")
.maybeSingle();

setActionKey(null);

if (error) {
toast.error("Не удалось обновить доверенный статус DJ");
return;
}

setDjItems((prev) =>
prev.map((item) =>
item.id === dj.id ? { ...item, is_trusted: Boolean((data as any)?.is_trusted ?? nextTrusted) } as Tables<"dj_profiles"> : item
)
);

toast.success(nextTrusted ? UI_LABELS.trustedGrantedDj : UI_LABELS.trustedRevokedDj);
};

const handleRemoveDjPhoto = async (dj: Tables<"dj_profiles">) => {
const key = `dj-${dj.id}-photo`;
setActionKey(key);

const { error } = await supabase
.from("dj_profiles")
.update({ image_url: null })
.eq("id", dj.id);

setActionKey(null);

if (error) {
toast.error("Не удалось удалить фото");
return;
}

setDjItems((prev) =>
prev.map((item) =>
item.id === dj.id ? { ...item, image_url: null } as Tables<"dj_profiles"> : item
)
);

toast.success("Фото удалено");
};

const handleVenueStatus = async (venue: Tables<"venue_profiles">, status: ProfileStatus) => {
const key = `venue-${venue.id}-${status}`;
setActionKey(key);

const { data, error } = await supabase
.from("venue_profiles")
.update({ status })
.eq("id", venue.id)
.select("id, status")
.maybeSingle();

setActionKey(null);

if (error) {
toast.error("Не удалось обновить статус заведения");
return;
}

if (!data) {
toast.error("Статус заведения не сохранился. Проверь права/RLS.");
return;
}

setVenueItems((prev) =>
prev.map((item) =>
item.id === venue.id ? { ...item, status: data.status as ProfileStatus } : item
)
);

toast.success(
status === "active"
? "Заведение снова видно в маркетплейсе"
: "Статус заведения обновлён"
);
};

const handleDeleteVenue = async (id: string) => {
if (!confirm("Удалить заведение навсегда? Это доступно только без связанной истории.")) return;

const deps = await getVenueDependencyCount(id);
if (deps.error) {
toast.error("Не удалось проверить связанные данные заведения");
return;
}

if (deps.count > 0) {
toast.error("Нельзя удалить заведение: есть связанная история. Используйте скрытие, архив или блокировку.");
return;
}

const { error, count } = await supabase
.from("venue_profiles")
.delete({ count: "exact" })
.eq("id", id);

if (error) {
toast.error("Нельзя удалить заведение: есть связанные данные. Используйте архив или блокировку.");
return;
}

if (count === 0) {
toast.error("Не удалось удалить — нет прав администратора");
return;
}

setVenueItems((prev) => prev.filter((v) => v.id !== id));
toast.success("Заведение удалено");
};

const handleToggleVenue = async (venue: Tables<"venue_profiles">) => {
await handleVenueStatus(venue, venue.status === "active" ? "hidden" : "active");
};

const handleToggleVenueTrusted = async (venue: Tables<"venue_profiles">) => {
const currentTrusted = Boolean((venue as any).is_trusted);
const nextTrusted = !currentTrusted;
const key = `venue-${venue.id}-trusted`;
setActionKey(key);

const { data, error } = await supabase
.from("venue_profiles")
.update({ is_trusted: nextTrusted } as any)
.eq("id", venue.id)
.select("id, is_trusted")
.maybeSingle();

setActionKey(null);

if (error) {
toast.error("Не удалось обновить доверенный статус заведения");
return;
}

setVenueItems((prev) =>
prev.map((item) =>
item.id === venue.id ? { ...item, is_trusted: Boolean((data as any)?.is_trusted ?? nextTrusted) } as Tables<"venue_profiles"> : item
)
);

toast.success(nextTrusted ? UI_LABELS.trustedGrantedVenue : UI_LABELS.trustedRevokedVenue);
};

const handleRemoveVenuePhoto = async (venue: Tables<"venue_profiles">) => {
const key = `venue-${venue.id}-photo`;
setActionKey(key);

const { error } = await supabase
.from("venue_profiles")
.update({ image_url: null })
.eq("id", venue.id);

setActionKey(null);

if (error) {
toast.error("Не удалось удалить фото");
return;
}

setVenueItems((prev) =>
prev.map((item) =>
item.id === venue.id ? { ...item, image_url: null } as Tables<"venue_profiles"> : item
)
);

toast.success("Фото удалено");
};

const handleClearDjDescription = async (dj: Tables<"dj_profiles">) => {
const key = `dj-${dj.id}-clear-description`;
setActionKey(key);
const { error } = await supabase
.from("dj_profiles")
.update({ bio: null })
.eq("id", dj.id);
setActionKey(null);

if (error) {
toast.error("Не удалось очистить описание");
return;
}

setDjItems((prev) => prev.map((item) => (
item.id === dj.id ? { ...item, bio: null } as Tables<"dj_profiles"> : item
)));
toast.success("Описание очищено");
};

const handleClearVenueDescription = async (venue: Tables<"venue_profiles">) => {
const key = `venue-${venue.id}-clear-description`;
setActionKey(key);
const { error } = await supabase
.from("venue_profiles")
.update({ description: null })
.eq("id", venue.id);
setActionKey(null);

if (error) {
toast.error("Не удалось очистить описание");
return;
}

setVenueItems((prev) => prev.map((item) => (
item.id === venue.id ? { ...item, description: null } as Tables<"venue_profiles"> : item
)));
toast.success("Описание очищено");
};

const openProfileEditor = (profile: Tables<"dj_profiles"> | Tables<"venue_profiles">, kind: "dj" | "venue") => {
setEditingProfile({ kind, profile } as AdminEditProfileState);
setEditName(String(profile.name ?? ""));
setEditPrice(kind === "dj" ? String((profile as Tables<"dj_profiles">).price ?? "") : "");
};

const closeProfileEditor = () => {
if (actionKey?.startsWith("edit-")) return;
setEditingProfile(null);
setEditName("");
setEditPrice("");
};

const handleSaveProfileEdit = async () => {
if (!editingProfile) return;

const trimmedName = editName.trim();
const nameError = validateProfileName(trimmedName);
if (nameError) {
toast.error(nameError);
 return;
}

if (editingProfile.kind === "dj") {
const priceError = validateDjPrice(editPrice);
if (priceError) {
toast.error(priceError);
 return;
}
const parsedPrice = Number(editPrice.trim());

const key = `edit-dj-${editingProfile.profile.id}`;
setActionKey(key);
const { data, error } = await supabase
.from("dj_profiles")
.update({ name: trimmedName, price: String(parsedPrice) })
.eq("id", editingProfile.profile.id)
.select("id, name, price")
.maybeSingle();
setActionKey(null);

if (error || !data) {
toast.error("Не удалось обновить профиль");
return;
}

setDjItems((prev) => prev.map((item) => (
item.id === editingProfile.profile.id
? { ...item, name: data.name ?? trimmedName, price: data.price ?? String(parsedPrice) }
: item
)));
toast.success("Профиль обновлён");
closeProfileEditor();
return;
}

const key = `edit-venue-${editingProfile.profile.id}`;
setActionKey(key);
const { data, error } = await supabase
.from("venue_profiles")
.update({ name: trimmedName })
.eq("id", editingProfile.profile.id)
.select("id, name")
.maybeSingle();
setActionKey(null);

if (error || !data) {
toast.error("Не удалось обновить профиль");
return;
}

setVenueItems((prev) => prev.map((item) => (
item.id === editingProfile.profile.id
? { ...item, name: data.name ?? trimmedName }
: item
)));
toast.success("Профиль обновлён");
closeProfileEditor();
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
if (post?.moderation_status === "archived") {
toast.error("Публикация находится в архиве");
return;
}
if (post?.moderation_status === "blocked") {
toast.error("Публикация заблокирована модератором");
return;
}

const { data, error } = await supabase
.from("venue_posts")
.update({ status: "closed" })
.eq("id", id)
.select("*, venue_profiles(*)")
.maybeSingle();

if (error) {
toast.error("Не удалось закрыть публикацию");
return;
}

if (data) updatePost(id, data as any);
toast.success("Публикация закрыта");
};

const handlePostModeration = async (id: string, moderationStatus: PostModerationStatus) => {
const updates =
moderationStatus === "archived"
? { status: "closed", moderation_status: moderationStatus }
: { moderation_status: moderationStatus };

const { data, error } = await supabase
.from("venue_posts" as any)
.update(updates)
.eq("id", id)
.select("*, venue_profiles(*)")
.maybeSingle();

if (error) {
toast.error("Не удалось обновить модерацию публикации");
return;
}

if (data) updatePost(id, data as any);
toast.success(
moderationStatus === "active"
? "Публикация снова видна"
: "Модерация публикации обновлена"
);
};

const handleFeedbackStatus = async (id: string, status: FeedbackStatus) => {
const key = `feedback-${id}-${status}`;
setActionKey(key);
const { data, error } = await updateFeedbackStatus(id, status);
setActionKey(null);

if (error) {
toast.error("Не удалось обновить статус обращения");
return;
}

setFeedback((prev) =>
prev.map((item) =>
item.id === id ? { ...item, status: ((data as any)?.status ?? status) as FeedbackStatus } : item
)
);
toast.success("Статус обращения обновлён");
};

const tabs = [
{ key: "djs" as const, label: "DJ", count: djItems.length },
{ key: "venues" as const, label: "Заведения", count: venueItems.length },
{ key: "posts" as const, label: "Публикации", count: allPosts.length },
{ key: "apps" as const, label: "Отклики", count: allApps.length },
{ key: "invites" as const, label: "Приглашения", count: allInvites.length },
{ key: "feedback" as const, label: "Обратная связь", count: allFeedback.length },
];

if (!user) return null;
if (!isAdmin) return null;

return (
<div className="min-h-screen pb-12 pt-20">
<div className="container mx-auto max-w-4xl px-4">
<div className="mb-6 flex items-center justify-between">
<div className="flex items-center gap-3">
<button
onClick={() => navigate("/djs")}
className="rounded-lg border border-white/10 bg-background/35 p-2 text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
type="button"
>
<ArrowLeft className="h-5 w-5" />
</button>
<h1 className="text-2xl font-bold">
<span className="text-primary">Админ</span> панель
</h1>
</div>

<Link
to="/admin/community"
className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
>
<MessageCircle className="h-3.5 w-3.5" /> Комьюнити чат
</Link>
</div>

<div className="premium-surface mb-6 flex gap-1 overflow-x-auto p-1">
{tabs.map((t) => (
<button
key={t.key}
onClick={() => setTab(t.key)}
className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
tab === t.key
? "bg-primary/10 text-primary"
: "text-muted-foreground hover:bg-white/5 hover:text-foreground"
}`}
type="button"
>
{t.label} <span className="opacity-60">({t.count})</span>
</button>
))}
</div>

{tab === "djs" && (
<div className="space-y-1">
{loadingProfiles && (
<p className="py-4 text-center text-sm text-muted-foreground">Загрузка DJ...</p>
)}

{!loadingProfiles &&
djItems.map((dj) => (
<div
key={dj.id}
className="premium-row flex items-center justify-between gap-3 px-4 py-2.5"
>
<div className="min-w-0 flex-1">
<div className="flex items-center gap-2">
<span className="truncate text-sm font-semibold">{dj.name}</span>
<span className={`text-[10px] font-mono ${statusColor[dj.status]}`}>
{statusLabel[dj.status]}
</span>
{Boolean((dj as any).is_verified) && (
<span className="text-[10px] text-muted-foreground">? {UI_LABELS.verified}</span>
)}
{Boolean((dj as any).is_trusted) && (
<span className="text-[10px] text-primary">? {UI_LABELS.trusted}</span>
)}
</div>
<div className="text-xs text-muted-foreground">
{getCityLabel(dj.city)} · {dj.price}
</div>
</div>

<div className="flex shrink-0 items-center gap-1">
<button
onClick={() => openProfileEditor(dj, "dj")}
className="rounded p-1.5 transition-colors hover:bg-white/10 disabled:opacity-50"
title="Изменить"
disabled={actionKey !== null}
type="button"
>
<Pencil className="h-3.5 w-3.5 text-muted-foreground" />
</button>

<button
onClick={() => handleToggleDjTrusted(dj)}
className={trustedButtonClass(Boolean((dj as any).is_trusted))}
title={Boolean((dj as any).is_trusted) ? UI_LABELS.removeTrusted : UI_LABELS.issueTrusted}
disabled={actionKey !== null}
type="button"
>
<span className="block text-[11px] leading-none">◆</span>
</button>

<button
onClick={() => handleToggleDj(dj)}
className="rounded p-1.5 transition-colors hover:bg-white/10 disabled:opacity-50"
disabled={actionKey !== null}
type="button"
>
{dj.status === "active" ? (
<EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
) : (
<Eye className="h-3.5 w-3.5 text-primary" />
)}
</button>

<button
onClick={() => handleDjStatus(dj, "blocked")}
className="rounded p-1.5 transition-colors hover:bg-destructive/10 disabled:opacity-50"
title="Заблокировать"
disabled={actionKey !== null}
type="button"
>
<Ban className="h-3.5 w-3.5 text-destructive" />
</button>

<button
onClick={() => handleRemoveDjPhoto(dj)}
className="rounded p-1.5 transition-colors hover:bg-white/10 disabled:opacity-50"
title="Удалить фото"
disabled={actionKey !== null}
type="button"
>
<ImageOff className="h-3.5 w-3.5 text-muted-foreground" />
</button>

<button
onClick={() => handleClearDjDescription(dj)}
className="rounded p-1.5 transition-colors hover:bg-white/10 disabled:opacity-50"
title="Очистить описание"
disabled={actionKey !== null}
type="button"
>
<X className="h-3.5 w-3.5 text-muted-foreground" />
</button>

<button
onClick={() => handleDjStatus(dj, "archived")}
className="rounded p-1.5 transition-colors hover:bg-white/10 disabled:opacity-50"
title="В архив"
disabled={actionKey !== null}
type="button"
>
<Archive className="h-3.5 w-3.5 text-muted-foreground" />
</button>

<button
onClick={() => handleDeleteDj(dj.id)}
className="rounded p-1.5 transition-colors hover:bg-destructive/10 disabled:opacity-50"
disabled={actionKey !== null}
type="button"
>
<Trash2 className="h-3.5 w-3.5 text-destructive" />
</button>
</div>
</div>
))}
</div>
)}

{tab === "venues" && (
<div className="space-y-1">
{loadingProfiles && (
<p className="py-4 text-center text-sm text-muted-foreground">
Загрузка заведений...
</p>
)}

{!loadingProfiles &&
venueItems.map((v) => (
<div
key={v.id}
className="premium-row flex items-center justify-between gap-3 px-4 py-2.5"
>
<div className="min-w-0 flex-1">
<div className="flex items-center gap-2">
<span className="truncate text-sm font-semibold">{v.name}</span>
<span className={`text-[10px] font-mono ${statusColor[v.status]}`}>
{statusLabel[v.status]}
</span>
{Boolean((v as any).is_verified) && (
<span className="text-[10px] text-muted-foreground">? {UI_LABELS.verified}</span>
)}
{Boolean((v as any).is_trusted) && (
<span className="text-[10px] text-primary">? {UI_LABELS.trusted}</span>
)}
</div>
<div className="text-xs text-muted-foreground">
{getCityLabel(v.city)} · {v.type}
</div>
</div>

<div className="flex shrink-0 items-center gap-1">
<button
onClick={() => openProfileEditor(v, "venue")}
className="rounded p-1.5 transition-colors hover:bg-white/10 disabled:opacity-50"
title="Изменить"
disabled={actionKey !== null}
type="button"
>
<Pencil className="h-3.5 w-3.5 text-muted-foreground" />
</button>

<button
onClick={() => handleToggleVenueTrusted(v)}
className={trustedButtonClass(Boolean((v as any).is_trusted))}
title={Boolean((v as any).is_trusted) ? UI_LABELS.removeTrusted : UI_LABELS.issueTrusted}
disabled={actionKey !== null}
type="button"
>
<span className="block text-[11px] leading-none">◆</span>
</button>

<button
onClick={() => handleToggleVenue(v)}
className="rounded p-1.5 transition-colors hover:bg-white/10 disabled:opacity-50"
disabled={actionKey !== null}
type="button"
>
{v.status === "active" ? (
<EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
) : (
<Eye className="h-3.5 w-3.5 text-primary" />
)}
</button>

<button
onClick={() => handleVenueStatus(v, "blocked")}
className="rounded p-1.5 transition-colors hover:bg-destructive/10 disabled:opacity-50"
title="Заблокировать"
disabled={actionKey !== null}
type="button"
>
<Ban className="h-3.5 w-3.5 text-destructive" />
</button>

<button
onClick={() => handleRemoveVenuePhoto(v)}
className="rounded p-1.5 transition-colors hover:bg-white/10 disabled:opacity-50"
title="Удалить фото"
disabled={actionKey !== null}
type="button"
>
<ImageOff className="h-3.5 w-3.5 text-muted-foreground" />
</button>

<button
onClick={() => handleClearVenueDescription(v)}
className="rounded p-1.5 transition-colors hover:bg-white/10 disabled:opacity-50"
title="Очистить описание"
disabled={actionKey !== null}
type="button"
>
<X className="h-3.5 w-3.5 text-muted-foreground" />
</button>

<button
onClick={() => handleVenueStatus(v, "archived")}
className="rounded p-1.5 transition-colors hover:bg-white/10 disabled:opacity-50"
title="В архив"
disabled={actionKey !== null}
type="button"
>
<Archive className="h-3.5 w-3.5 text-muted-foreground" />
</button>

<button
onClick={() => handleDeleteVenue(v.id)}
className="rounded p-1.5 transition-colors hover:bg-destructive/10 disabled:opacity-50"
disabled={actionKey !== null}
type="button"
>
<Trash2 className="h-3.5 w-3.5 text-destructive" />
</button>
</div>
</div>
))}
</div>
)}

{tab === "posts" && (
<div className="space-y-1">
{allPosts.length === 0 && (
<p className="py-4 text-center text-sm text-muted-foreground">Нет публикаций</p>
)}

{allPosts.map((p) => (
<div
key={p.id}
className="premium-row flex items-center justify-between gap-3 px-4 py-2.5"
>
<div className="min-w-0 flex-1">
<div className="flex items-center gap-2">
<span className="truncate text-sm font-semibold">{p.title}</span>
<span className="text-[10px] text-muted-foreground">
{getGigTypeLabel(p.post_type)}
</span>
<span
className={`text-[10px] font-mono ${
normalizePostStatus(p.status) === "open" ? "text-primary" : "text-muted-foreground"
}`}
>
{normalizePostStatus(p.status) === "open" ? GIG_STATUS_LABEL.open : GIG_STATUS_LABEL.closed}
</span>
<span className="text-[10px] text-muted-foreground">
{moderationLabel[normalizeModerationStatus((p as { moderation_status?: unknown }).moderation_status)] ?? ""}
</span>
</div>
<div className="text-xs text-muted-foreground">
{(p as any).venue_profiles?.name ?? ""} · {getCityLabel(p.city)}
</div>
</div>

<div className="flex shrink-0 items-center gap-1">
{normalizePostStatus(p.status) === "open" &&
!["archived", "blocked"].includes(normalizeModerationStatus((p as { moderation_status?: unknown }).moderation_status)) && (
<button
onClick={() => handleForceClosePost(p.id)}
className="rounded p-1.5 transition-colors hover:bg-white/10"
title="Закрыть"
type="button"
>
<X className="h-3.5 w-3.5 text-muted-foreground" />
</button>
)}

{!["archived", "blocked"].includes(normalizeModerationStatus((p as { moderation_status?: unknown }).moderation_status)) && (
<button
onClick={() =>
handlePostModeration(
p.id,
normalizeModerationStatus((p as { moderation_status?: unknown }).moderation_status) === "hidden"
? "active"
: "hidden"
)
}
className="rounded p-1.5 transition-colors hover:bg-white/10"
title="Скрыть из маркетплейса"
type="button"
>
{normalizeModerationStatus((p as { moderation_status?: unknown }).moderation_status) === "hidden" ? (
<Eye className="h-3.5 w-3.5 text-primary" />
) : (
<EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
)}
</button>
)}

<button
onClick={() => handlePostModeration(p.id, "archived")}
className="rounded p-1.5 transition-colors hover:bg-white/10"
title="В архив"
type="button"
>
<Archive className="h-3.5 w-3.5 text-muted-foreground" />
</button>

<button
onClick={() => handlePostModeration(p.id, "blocked")}
className="rounded p-1.5 transition-colors hover:bg-destructive/10"
title="Заблокировать"
type="button"
>
<Ban className="h-3.5 w-3.5 text-destructive" />
</button>

{normalizePostStatus(p.status) === "closed" && (
<button
onClick={() => handleDeletePost(p.id)}
className="rounded p-1.5 transition-colors hover:bg-destructive/10"
title="Удалить безопасно"
type="button"
>
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
{allApps.length === 0 && (
<p className="py-4 text-center text-sm text-muted-foreground">Нет откликов</p>
)}

{allApps.map((a) => (
<div
key={a.id}
className="premium-row flex items-center justify-between gap-3 px-4 py-2.5"
>
<div className="min-w-0 flex-1">
<div className="flex items-center gap-2">
<span className="truncate text-sm font-semibold">
{a.dj_profiles?.name ?? "DJ"}
</span>
<span className="text-[10px] text-muted-foreground">→</span>
<span className="truncate text-sm text-muted-foreground">
{a.venue_posts?.title ?? ""}
</span>
<span className={`text-[10px] font-mono ${getApplicationStatusClass(a.status)}`}>
{getApplicationStatusLabel(a.status)}
</span>
</div>
</div>

<div className="flex shrink-0 items-center gap-1">
{(canVenueAcceptApplication(a) || canVenueRejectApplication(a)) && (
<>
<button
onClick={() => handleAppStatus(a.id, "accepted")}
className="rounded p-1.5 transition-colors hover:bg-primary/10"
type="button"
>
<Check className="h-3.5 w-3.5 text-primary" />
</button>
<button
onClick={() => handleAppStatus(a.id, "rejected")}
className="rounded p-1.5 transition-colors hover:bg-destructive/10"
type="button"
>
<X className="h-3.5 w-3.5 text-destructive" />
</button>
</>
)}
</div>
</div>
))}
</div>
)}

{tab === "invites" && (
<div className="space-y-1">
{allInvites.length === 0 && (
<p className="py-4 text-center text-sm text-muted-foreground">Нет приглашений</p>
)}

{allInvites.map((inv) => (
<div
key={inv.id}
className="premium-row flex items-center justify-between gap-3 px-4 py-2.5"
>
<div className="min-w-0 flex-1">
<div className="flex items-center gap-2">
<span className="truncate text-sm font-semibold">
{(inv as any).venue_profiles?.name ?? "Venue"}
</span>
<span className="text-[10px] text-muted-foreground">→</span>
<span className="truncate text-sm text-muted-foreground">
{inv.dj_profiles?.name ?? "DJ"}
</span>
<span className={`text-[10px] font-mono ${getApplicationStatusClass(inv.status)}`}>
{getApplicationStatusLabel(inv.status)}
</span>
</div>
<div className="text-xs text-muted-foreground">
{inv.venue_posts?.title ?? ""}
</div>
</div>

<div className="flex shrink-0 items-center gap-1">
{inv.status === "new" && (
<>
<button
onClick={() => handleInviteStatus(inv.id, "accepted")}
className="rounded p-1.5 transition-colors hover:bg-primary/10"
type="button"
>
<Check className="h-3.5 w-3.5 text-primary" />
</button>
<button
onClick={() => handleInviteStatus(inv.id, "rejected")}
className="rounded p-1.5 transition-colors hover:bg-destructive/10"
type="button"
>
<X className="h-3.5 w-3.5 text-destructive" />
</button>
</>
)}
</div>
</div>
))}
</div>
)}

{tab === "feedback" && (
<div className="space-y-2">
{loadingFeedback && (
<p className="py-4 text-center text-sm text-muted-foreground">Загрузка обратной связи...</p>
)}

{!loadingFeedback && allFeedback.length === 0 && (
<p className="py-4 text-center text-sm text-muted-foreground">Нет обращений</p>
)}

{!loadingFeedback && allFeedback.map((item) => (
<div key={item.id} className="premium-row flex flex-col gap-3 px-4 py-3">
<div className="flex flex-wrap items-start justify-between gap-3">
<div className="min-w-0 flex-1">
<div className="flex flex-wrap items-center gap-2">
<span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-primary">
{FEEDBACK_TYPE_LABELS[item.type]}
</span>
<span className="text-[10px] text-muted-foreground">
{new Date(item.created_at).toLocaleString("ru-RU")}
</span>
<span className="text-[10px] text-muted-foreground">
user: {item.user_id}
</span>
</div>
<p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">{item.message}</p>
</div>

<select
className="djhub-select w-auto min-w-32 text-xs"
value={item.status}
disabled={actionKey !== null}
onChange={(event) => handleFeedbackStatus(item.id, event.target.value as FeedbackStatus)}
>
{(Object.entries(FEEDBACK_STATUS_LABELS) as [FeedbackStatus, string][]).map(([value, label]) => (
<option key={value} value={value}>{label}</option>
))}
</select>
</div>

<div className="text-xs text-muted-foreground">
Статус: {FEEDBACK_STATUS_LABELS[item.status]}
</div>
</div>
))}
</div>
)}

{editingProfile && (
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm">
<div className="premium-surface w-full max-w-md p-5">
<div className="flex items-start justify-between gap-3">
<div>
<p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Модерация профиля</p>
<h2 className="mt-1 text-lg font-bold text-foreground">Изменить</h2>
</div>
<button
type="button"
onClick={closeProfileEditor}
disabled={Boolean(actionKey?.startsWith("edit-"))}
className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-50"
>
<X className="h-4 w-4" />
</button>
</div>

<div className="mt-4 space-y-4">
<div>
<label className="mb-1.5 block text-xs font-semibold text-foreground/85">Имя</label>
<input
className="premium-input w-full"
value={editName}
maxLength={40}
onChange={(event) => setEditName(event.target.value)}
placeholder={editingProfile.kind === "dj" ? "Имя DJ" : "Название заведения"}
/>
</div>

{editingProfile.kind === "dj" && (
<div>
<label className="mb-1.5 block text-xs font-semibold text-foreground/85">Цена ₽/час</label>
<input
className="premium-input w-full"
value={editPrice}
inputMode="numeric"
onChange={(event) => setEditPrice(event.target.value.replace(/[^\d]/g, ""))}
placeholder="Например: 5000"
/>
</div>
)}
</div>

<div className="mt-5 flex items-center justify-end gap-2">
<button
type="button"
onClick={closeProfileEditor}
disabled={Boolean(actionKey?.startsWith("edit-"))}
className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-white/10 disabled:opacity-50"
>
Отмена
</button>
<button
type="button"
onClick={handleSaveProfileEdit}
disabled={Boolean(actionKey?.startsWith("edit-"))}
className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
>
Сохранить
</button>
</div>
</div>
</div>
)}
</div>
</div>
);
};

export default Admin;


