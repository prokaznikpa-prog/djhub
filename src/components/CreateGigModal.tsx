import { useState } from "react";
import { MUSIC_STYLES } from "@/data/djhub-data";
import type { Gig } from "@/data/djhub-data";
import { addGig, getCurrentVenueProfile } from "@/data/store";
import { X } from "lucide-react";
import { toast } from "sonner";
import { CITY_OPTIONS } from "@/lib/geography";

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

  const inputCls = "premium-input";
  const selectCls = "djhub-select w-full text-sm";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 px-4 backdrop-blur-md">
      <div className="premium-surface w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-foreground">Создать выступление</h2>
          <button onClick={onClose} className="rounded-lg border border-white/10 bg-background/45 p-1.5 text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1 text-foreground">Город <span className="text-destructive">*</span></label>
            <select className={selectCls} value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">Выбрать</option>
              {CITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
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
                      : "border-white/10 bg-white/5 text-muted-foreground hover:border-primary/40 hover:bg-primary/10"
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
          <button type="submit" className="btn-glow mt-2 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
            Создать
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreateGigModal;
