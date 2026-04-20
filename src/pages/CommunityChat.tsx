import { MessageCircle, Lock } from "lucide-react";

const CHAT_SECTIONS = ["Techno", "House", "Hip-Hop", "Witch House", "Other"];

const CommunityChat = () => (
  <div className="min-h-screen pt-20 pb-12">
    <div className="container mx-auto max-w-3xl px-4">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-2xl font-bold">
          <span className="text-primary">Комьюнити</span> чат
        </h1>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary flex items-center gap-1">
          <Lock className="h-2.5 w-2.5" /> Скоро
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-6">Чаты по стилям музыки — функция находится в разработке</p>

      <div className="space-y-3">
        {CHAT_SECTIONS.map((section) => (
          <div key={section} className="premium-surface space-y-3 p-4 opacity-70 transition-colors hover:border-primary/25">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">{section}</h3>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span>0 участников</span>
              </div>
            </div>
            <div className="flex items-center justify-center rounded-xl border border-border/50 bg-background/35 p-6">
              <p className="text-xs text-muted-foreground">Чат будет доступен позже</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default CommunityChat;
