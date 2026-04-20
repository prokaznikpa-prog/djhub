import { useState } from "react";
import { MUSIC_STYLES } from "@/data/djhub-data";
import { createVenuePost } from "@/hooks/useMarketplace";
import {
  GIG_DURATION_OPTIONS,
  GIG_TYPES,
  RESIDENCY_FREQUENCY_OPTIONS,
  RESIDENCY_SCHEDULE_OPTIONS,
  toGigInsert,
  type GigType,
} from "@/lib/gigs";
import { CITY_OPTIONS } from "@/lib/geography";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { VenuePost } from "@/hooks/useMarketplace";

interface Props {
  venueId: string;
  venueCity: string;
  onClose: () => void;
  onCreated: (post?: VenuePost) => void;
}

const digitsOnly = (value: string) => value.replace(/\D/g, "");
const DESCRIPTION_LIMIT = 200;

const CreatePostModal = ({ venueId, venueCity, onClose, onCreated }: Props) => {
  const [postType, setPostType] = useState<GigType>("gig");
  const [title, setTitle] = useState("");
  const [city, setCity] = useState(venueCity);
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  // gig
  const [eventDate, setEventDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState("");
  // casting
  const [requirements, setRequirements] = useState("");
  const [portfolioRequired, setPortfolioRequired] = useState(false);
  const [deadline, setDeadline] = useState("");
  // residency
  const [schedule, setSchedule] = useState("");
  const [frequency, setFrequency] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const gigFieldErrors = {
    budget: postType === "gig" && submitAttempted && !budget.trim() ? "Укажите бюджет" : "",
    eventDate: postType === "gig" && submitAttempted && !eventDate ? "Укажите дату" : "",
    startTime: postType === "gig" && submitAttempted && !startTime ? "Укажите время" : "",
    duration: postType === "gig" && submitAttempted && !duration ? "Укажите длительность" : "",
  };
  const hasGigFieldErrors = Object.values(gigFieldErrors).some(Boolean);

  const toggleStyle = (s: string) => {
    setSelectedStyles((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    if (!title.trim() || !city.trim()) {
      toast.error("Заполните название и город");
      return;
    }
    if (postType === "gig" && (!budget.trim() || !eventDate || !startTime || !duration)) {
      toast.error("Заполните бюджет, дату, время и длительность");
      return;
    }
    setSaving(true);
    const { data, error } = await createVenuePost(toGigInsert({
      venueId,
      title: title.trim(),
      city: city.trim(),
      description: description.trim(),
      budget: budget.trim(),
      musicStyles: selectedStyles,
      type: postType,
      eventDate,
      startTime,
      duration,
      requirements,
      portfolioRequired,
      deadline,
      schedule,
      frequency,
    }));
    setSaving(false);
    if (error) {
      toast.error("Ошибка: " + error.message);
      return;
    }
    toast.success("Публикация создана!");
    onCreated((data as VenuePost | null) ?? undefined);
    onClose();
  };

  const inputCls = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";
  const selectCls = "djhub-select w-full text-sm";
  const labelCls = "text-xs font-medium text-muted-foreground mb-1 block";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Создать публикацию</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Type selector */}
        <div>
          <label className={labelCls}>Тип</label>
          <div className="flex gap-2">
            {GIG_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setPostType(t.value)}
                className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                  postType === t.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>Название</label>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="DJ Night / Open Call / Резидент-программа" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Город</label>
            <select className={selectCls} value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">Выбрать</option>
              {CITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Бюджет</label>
            <input className={inputCls} value={budget} inputMode="numeric" pattern="[0-9]*" onChange={(e) => setBudget(digitsOnly(e.target.value))} placeholder="5 000 ₽" />
            {gigFieldErrors.budget && <p className="mt-1 text-[10px] text-destructive">{gigFieldErrors.budget}</p>}
          </div>
        </div>

        {/* Styles */}
        <div>
          <label className={labelCls}>Стили</label>
          <div className="flex flex-wrap gap-1.5">
            {MUSIC_STYLES.map((s) => (
              <button
                key={s}
                onClick={() => toggleStyle(s)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  selectedStyles.includes(s) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Conditional fields */}
        {postType === "gig" && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Дата</label>
              <input type="date" className={inputCls} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              {gigFieldErrors.eventDate && <p className="mt-1 text-[10px] text-destructive">{gigFieldErrors.eventDate}</p>}
            </div>
            <div>
              <label className={labelCls}>Время</label>
              <input type="time" min="00:00" max="23:59" step="300" className={inputCls} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              {gigFieldErrors.startTime && <p className="mt-1 text-[10px] text-destructive">{gigFieldErrors.startTime}</p>}
            </div>
            <div>
              <label className={labelCls}>Длительность</label>
              <select className={selectCls} value={duration} onChange={(e) => setDuration(e.target.value)}>
                <option value="">Выбрать</option>
                {GIG_DURATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {gigFieldErrors.duration && <p className="mt-1 text-[10px] text-destructive">{gigFieldErrors.duration}</p>}
            </div>
          </div>
        )}

        {postType === "casting" && (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Требования</label>
              <textarea className={inputCls + " h-16 resize-none"} value={requirements} onChange={(e) => setRequirements(e.target.value)} placeholder="Опыт от 1 года..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Дедлайн</label>
                <input type="date" className={inputCls} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" checked={portfolioRequired} onChange={(e) => setPortfolioRequired(e.target.checked)} className="rounded" />
                <span className="text-xs text-muted-foreground">Портфолио обязательно</span>
              </div>
            </div>
          </div>
        )}

        {postType === "residency" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Расписание</label>
              <select className={selectCls} value={schedule} onChange={(e) => setSchedule(e.target.value)}>
                <option value="">Выбрать</option>
                {RESIDENCY_SCHEDULE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Частота</label>
              <select className={selectCls} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                <option value="">Выбрать</option>
                {RESIDENCY_FREQUENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div>
          <label className={labelCls}>Описание</label>
          <textarea
            className={inputCls + " h-20 resize-none"}
            value={description}
            maxLength={DESCRIPTION_LIMIT}
            onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_LIMIT))}
            placeholder="Дополнительная информация..."
          />
          <p className="mt-1 text-right text-[10px] text-muted-foreground">
            {description.length}/{DESCRIPTION_LIMIT}
          </p>
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving || (submitAttempted && hasGigFieldErrors)}
          className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Сохраняем..." : "Создать"}
        </button>
      </div>
    </div>
  );
};

export default CreatePostModal;
