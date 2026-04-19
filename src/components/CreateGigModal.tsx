import { useState } from "react";
import { MUSIC_STYLES } from "@/data/djhub-data";
import type { Gig } from "@/data/djhub-data";
import { addGig, getCurrentVenueProfile } from "@/data/store";
import { X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}
const digitsOnly = (value: string) => value.replace(/\D/g, "");

const CreateGigModal = ({ onClose, onCreated }: Props) => {
  const venue = getCurrentVenueProfile();
  const [city, setCity] = useState(venue?.city || "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [style, setStyle] = useState("");
  const [budget, setBudget] = useState("");
  const [format, setFormat] = useState("");

  const inputCls = "w-full rounded-xl border border-border/50 bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!city.trim() || !date.trim() || !time.trim() || !style || !budget.trim()) {
      toast.error("Заполните все обязательные поля");
      return;
    }
    const gig: Gig = {
      id: "gig-" + Date.now(),
      venueId: venue?.id || "",
      venueName: venue?.name || "Неизвестно",
      city: city.trim(),
      date: date.trim(),
      time: time.trim(),
      budget: budget.trim(),
      style,
      format: format.trim() || "Разово",
      status: "open",
    };
    addGig(gig);
    toast.success("Выступление создано!");
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border/50 bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-foreground">Создать выступление</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1 text-foreground">Город <span className="text-destructive">*</span></label>
            <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Санкт-Петербург" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1 text-foreground">Дата <span className="text-destructive">*</span></label>
              <input className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} placeholder="27.10.2026" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-foreground">Время <span className="text-destructive">*</span></label>
              <input className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} placeholder="22:00–23:00" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-foreground">Стиль <span className="text-destructive">*</span></label>
            <div className="flex flex-wrap gap-1.5">
              {MUSIC_STYLES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStyle(s)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-medium border transition-colors ${
                    style === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border/50 hover:border-primary/40"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1 text-foreground">Бюджет <span className="text-destructive">*</span></label>
              <input className={inputCls} value={budget} inputMode="numeric" pattern="[0-9]*" onChange={(e) => setBudget(digitsOnly(e.target.value))} placeholder="3 000 ₽" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-foreground">Формат</label>
              <input className={inputCls} value={format} onChange={(e) => setFormat(e.target.value)} placeholder="Разово / Регулярка" />
            </div>
          </div>
          <button type="submit" className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 mt-2">
            Создать
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreateGigModal;
