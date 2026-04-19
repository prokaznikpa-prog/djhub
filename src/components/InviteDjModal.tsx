import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { createInvitation, checkInvited, useVenuePostsByVenue, createNotification } from "@/hooks/useMarketplace";
import { supabase } from "@/integrations/supabase/client";
import { X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  venueId: string;
  djId: string;
  djName: string;
  onClose: () => void;
}

const InviteDjModal = ({ venueId, djId, djName, onClose }: Props) => {
  const { user } = useAuth();
  const { posts } = useVenuePostsByVenue(venueId);
  const activePosts = posts.filter((p) => p.status === "open");
  const [selectedPost, setSelectedPost] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (posts.length > 0 || loaded) return;
    const timer = setTimeout(() => setLoaded(true), 800);
    return () => clearTimeout(timer);
  }, [posts, loaded]);

  const handleSubmit = async () => {
    if (!selectedPost) {
      toast.error("Выберите публикацию");
      return;
    }
    setSaving(true);
    const alreadyInvited = await checkInvited(venueId, djId, selectedPost);
    if (alreadyInvited) {
      toast.error("Приглашение уже отправлено");
      setSaving(false);
      return;
    }
    const { error } = await createInvitation(venueId, djId, selectedPost, message.trim() || undefined);
    setSaving(false);
    if (error) {
      toast.error("Ошибка: " + error.message);
      return;
    }
    toast.success(`Приглашение отправлено ${djName}!`);

    // Create notifications
    if (user) {
      const selectedPostObj = activePosts.find((p) => p.id === selectedPost);
      await createNotification(user.id, "invitation", `Вы отправили приглашение ${djName}`, selectedPost);
      // Find DJ's user_id
      const { data: djData } = await supabase.from("dj_profiles").select("user_id").eq("id", djId).maybeSingle();
      if (djData?.user_id) {
        await createNotification(djData.user_id, "invitation", `Вам пришло приглашение на "${selectedPostObj?.title ?? ""}"`, selectedPost);
      }
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Пригласить {djName}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>

        {!loaded && activePosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Загрузка публикаций...</p>
        ) : activePosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">У вас нет активных публикаций. Создайте публикацию чтобы отправлять приглашения.</p>
        ) : (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Публикация</label>
              <select
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={selectedPost}
                onChange={(e) => setSelectedPost(e.target.value)}
              >
                <option value="">Выберите...</option>
                {activePosts.map((p) => (
                  <option key={p.id} value={p.id}>{p.title} ({p.post_type === "gig" ? "Выступление" : p.post_type === "casting" ? "Кастинг" : "Резидентство"})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Сообщение (необязательно)</label>
              <textarea
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm h-16 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Короткое сообщение..."
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Отправляем..." : "Отправить приглашение"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default InviteDjModal;
