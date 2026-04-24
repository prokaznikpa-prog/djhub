import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { createInvitation, checkInvited } from "@/domains/invitations/invitations.hooks";
import { createNotification } from "@/domains/notifications/notifications.hooks";
import { useVenuePostsByVenue } from "@/domains/posts/posts.hooks";
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
  const { posts, loading } = useVenuePostsByVenue(venueId);
  const activePosts = posts.filter((p) => p.status === "open");
  const [selectedPost, setSelectedPost] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 px-4 backdrop-blur-md">
      <div className="profile-section w-full max-w-md space-y-5 premium-surface p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">Приглашение</p>
            <h2 className="mt-1 text-lg font-bold text-foreground">Пригласить {djName}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg border border-white/10 bg-background/45 p-1.5 text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Загрузка публикаций...</p>
        ) : activePosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">У вас нет активных публикаций. Создайте публикацию чтобы отправлять приглашения.</p>
        ) : (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground/85">Публикация</label>
              <select
                className="djhub-select w-full text-sm"
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
              <label className="mb-1.5 block text-xs font-semibold text-foreground/85">Сообщение (необязательно)</label>
              <textarea
                className="premium-input h-20 resize-none"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Короткое сообщение..."
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="btn-glow w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
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
