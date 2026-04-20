import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Navigate, Link } from "react-router-dom";
import { MUSIC_STYLES } from "@/data/djhub-data";
import { toast } from "sonner";
import { MapPin, Upload, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { CITY_OPTIONS, getCityLabel } from "@/lib/geography";
import {
  DJ_AVAILABILITY_OPTIONS,
  DJ_EXPERIENCE_OPTIONS,
} from "@/lib/djOptions";
import {
  VENUE_TYPE_OPTIONS,
  VENUE_EQUIPMENT_OPTIONS,
  VENUE_CONDITIONS_OPTIONS,
  getVenueOptionLabel,
} from "@/lib/venueOptions";
import { getCachedValue, setCachedValue } from "@/lib/requestCache";

const TEXT_LIMIT = 200;
const digitsOnly = (value: string) => value.replace(/\D/g, "");

const upsertCachedProfile = <TProfile extends { id: string; created_at?: string }>(cacheKey: string, profile: TProfile) => {
  const current = getCachedValue<TProfile[]>(cacheKey, { allowStale: true }) ?? [];
  const next = [profile, ...current.filter((item) => item.id !== profile.id)].sort((a, b) => {
    const aTime = new Date(a.created_at ?? "").getTime() || 0;
    const bTime = new Date(b.created_at ?? "").getTime() || 0;
    return bTime - aTime;
  });
  setCachedValue(cacheKey, next);
};

const PreviewDjCard = ({ dj }: { dj: Tables<"dj_profiles"> }) => (
  <div className="premium-card overflow-hidden opacity-85">
    {dj.image_url && (
      <div className="aspect-[2/1] overflow-hidden">
        <img src={dj.image_url} alt={dj.name} className="h-full w-full object-cover" />
      </div>
    )}
    <div className="space-y-1 px-2.5 py-2">
      <div className="flex items-center justify-between">
        <h3 className="truncate text-xs font-semibold text-foreground">{dj.name}</h3>
        <span className="ml-1 shrink-0 text-[10px] font-mono text-primary">{dj.price}</span>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <MapPin className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate">{getCityLabel(dj.city)}</span>
      </div>
    </div>
  </div>
);

const PreviewVenueCard = ({ venue }: { venue: Tables<"venue_profiles"> }) => (
  <div className="premium-card overflow-hidden opacity-85">
    {venue.image_url && (
      <div className="aspect-[2/1] overflow-hidden">
        <img src={venue.image_url} alt={venue.name} className="h-full w-full object-cover" />
      </div>
    )}
    <div className="space-y-1 px-2.5 py-2">
      <div className="flex items-center justify-between">
        <h3 className="truncate text-xs font-semibold text-foreground">{venue.name}</h3>
        <span className="shrink-0 rounded-full bg-secondary px-1.5 py-px text-[9px] font-medium text-secondary-foreground">
          {getVenueOptionLabel(venue.type, VENUE_TYPE_OPTIONS)}
        </span>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <MapPin className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate">{getCityLabel(venue.city)}</span>
      </div>
    </div>
  </div>
);

const Register = () => {
  const {
    user,
    loading: authLoading,
    refreshProfiles,
    djProfile: existingDj,
    venueProfile: existingVenue,
  } = useAuth();

  const [searchParams] = useSearchParams();
  const role = searchParams.get("role") || localStorage.getItem("djhub_pending_role") || "dj";
  const navigate = useNavigate();
  const formRef = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const [djName, setDjName] = useState("");
  const [djCity, setDjCity] = useState("");
  const [djContact, setDjContact] = useState("");
  const [djStyles, setDjStyles] = useState<string[]>([]);
  const [djPrice, setDjPrice] = useState("");
  const [djBio, setDjBio] = useState("");
  const [djExperience, setDjExperience] = useState("");
  const [djPlayedAt, setDjPlayedAt] = useState("");
  const [djSoundcloud, setDjSoundcloud] = useState("");
  const [djInstagram, setDjInstagram] = useState("");
  const [djAvailability, setDjAvailability] = useState("");
  const [djCollab, setDjCollab] = useState(false);
  const [djCrew, setDjCrew] = useState(false);
  const [djPhotoPreview, setDjPhotoPreview] = useState<string | null>(null);

  const [venueName, setVenueName] = useState("");
  const [venueCity, setVenueCity] = useState("");
  const [venueType, setVenueType] = useState("");
  const [venueContact, setVenueContact] = useState("");
  const [venueStyles, setVenueStyles] = useState<string[]>([]);
  const [venueDesc, setVenueDesc] = useState("");
  const [venueEquipment, setVenueEquipment] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [venueConditions, setVenueConditions] = useState("");
  const [venuePhotoPreview, setVenuePhotoPreview] = useState<string | null>(null);
  const [previewDjs, setPreviewDjs] = useState<Tables<"dj_profiles">[]>([]);
  const [previewVenues, setPreviewVenues] = useState<Tables<"venue_profiles">[]>([]);

  useEffect(() => {
    let isMounted = true;

    const loadPreviews = async () => {
      const [djRes, venueRes] = await Promise.all([
        supabase
          .from("dj_profiles")
          .select("*")
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("venue_profiles")
          .select("*")
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(4),
      ]);

      if (!isMounted) return;
      setPreviewDjs(djRes.data ?? []);
      setPreviewVenues(venueRes.data ?? []);
    };

    void loadPreviews();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!authLoading && !user) {
    return <Navigate to="/signup" replace />;
  }

  if (!authLoading && user && (existingDj || existingVenue)) {
    return <Navigate to="/djs" replace />;
  }

  const handlePhotoChange = (file: File | null, setPreview: (s: string | null) => void) => {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Максимальный размер фото — 5 МБ");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const toggleStyle = (style: string, current: string[], setter: (v: string[]) => void) => {
    setter(current.includes(style) ? current.filter((s) => s !== style) : [...current, style]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (role === "dj") {
      if (!djName.trim()) newErrors.djName = "Введите DJ имя";
      if (!djCity) newErrors.djCity = "Выберите город";
      if (!djContact.trim()) newErrors.djContact = "Введите контакт";
      if (djStyles.length === 0) newErrors.djStyles = "Выберите хотя бы один стиль";
      if (!djPrice.trim()) newErrors.djPrice = "Введите цену";
      if (djBio.length > TEXT_LIMIT) newErrors.djBio = "Био не должно превышать 200 символов";
    } else {
      if (!venueName.trim()) newErrors.venueName = "Введите название";
      if (!venueCity) newErrors.venueCity = "Выберите город";
      if (!venueType) newErrors.venueType = "Выберите тип";
      if (!venueContact.trim()) newErrors.venueContact = "Введите контакт";
      if (venueStyles.length === 0) newErrors.venueStyles = "Выберите хотя бы один стиль";
      if (venueDesc.length > TEXT_LIMIT) newErrors.venueDesc = "Описание не должно превышать 200 символов";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error("Заполните все обязательные поля");
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      if (role === "dj") {
        const { data: supaRow, error: supaErr } = await supabase
          .from("dj_profiles")
          .insert({
            user_id: user!.id,
            name: djName.trim(),
            city: djCity,
            contact: djContact.trim(),
            styles: djStyles,
            priority_style: djStyles[0] || null,
            price: djPrice.trim(),
            bio: djBio.trim() || null,
            experience: djExperience || null,
            played_at: djPlayedAt.split(",").map((s) => s.trim()).filter(Boolean),
            availability: djAvailability || null,
            format: null,
            open_to_collab: djCollab,
            open_to_crew: djCrew,
            soundcloud: djSoundcloud.trim() || null,
            instagram: djInstagram.trim() || null,
            image_url: djPhotoPreview || null,
          })
          .select()
          .single();

        if (supaErr || !supaRow) throw supaErr ?? new Error("DJ profile was not created");
        setCachedValue(`dj:${supaRow.id}`, supaRow);
        upsertCachedProfile<Tables<"dj_profiles">>("catalog:djs:active", supaRow);
        await refreshProfiles();
        toast.success("Профиль DJ создан!");
        navigate("/djs");
      } else {
        const { data: supaRow, error: supaErr } = await supabase
          .from("venue_profiles")
          .insert({
            user_id: user!.id,
            name: venueName.trim(),
            city: venueCity,
            type: venueType,
            contact: venueContact.trim(),
            music_styles: venueStyles,
            description: venueDesc.trim() || null,
            equipment: venueEquipment || null,
            address: venueAddress.trim() || null,
            food_drinks: venueConditions || null,
            image_url: venuePhotoPreview || null,
          })
          .select()
          .single();

        if (supaErr || !supaRow) throw supaErr ?? new Error("Venue profile was not created");
        setCachedValue(`venue:${supaRow.id}`, supaRow);
        upsertCachedProfile<Tables<"venue_profiles">>("catalog:venues:active", supaRow);
        await refreshProfiles();
        toast.success("Профиль заведения создан!");
        navigate("/djs");
      }
    } catch (err) {
      console.error("Registration error:", err);
      toast.error("Ошибка при создании профиля");
    } finally {
      setSubmitting(false);
    }
  };

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const errorMsg = (key: string) =>
    errors[key] ? <p className="mt-0.5 text-[10px] text-destructive">{errors[key]}</p> : null;

  const inputCls = "premium-input";
  const selectCls = "djhub-select w-full text-sm";
  const labelCls = "mb-1 block text-xs font-medium text-foreground";
  const requiredMark = <span className="ml-0.5 text-destructive">*</span>;

  return (
    <div className="min-h-screen">
      <div className="relative flex min-h-screen" ref={formRef}>
        <div className="flex w-full flex-col items-center justify-start overflow-y-auto px-4 py-10 sm:px-6">
          <div className="auth-card max-w-lg space-y-6">
            <div>
              <Link
                to="/role-select"
                className="mb-3 inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">Назад к выбору роли</span>
              </Link>

              <div className="text-center">
                <h1 className="text-2xl font-bold">Регистрация</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {role === "dj" ? "Как DJ" : "Как заведение"}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {role === "dj" ? (
                <>
                  <div>
                    <label className={labelCls}>
                      DJ имя{requiredMark}
                    </label>
                    <input
                      className={inputCls}
                      value={djName}
                      onChange={(e) => setDjName(e.target.value)}
                      placeholder="Thededzzy"
                    />
                    {errorMsg("djName")}
                  </div>

                  <div>
                    <label className={labelCls}>Фото</label>
                    <label className="group flex cursor-pointer items-center gap-3">
                      {djPhotoPreview ? (
                        <img
                          src={djPhotoPreview}
                          alt="preview"
                          className="h-20 w-20 shrink-0 rounded-xl border border-white/10 bg-black object-cover object-center"
                        />
                      ) : (
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-white/15 bg-[#0f1115] transition-colors group-hover:border-primary/50">
                          <Upload className="h-5 w-5 shrink-0 text-muted-foreground" />
                        </div>
                      )}
                      <span className="min-w-0 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
                        Загрузить фото (до 5 МБ)
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handlePhotoChange(e.target.files?.[0] || null, setDjPhotoPreview)}
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelCls}>
                        Город{requiredMark}
                      </label>
                      <select
                        className={selectCls}
                        value={djCity}
                        onChange={(e) => setDjCity(e.target.value)}
                      >
                        <option value="">Выбрать</option>
                        {CITY_OPTIONS.map((city) => (
                          <option key={city.value} value={city.value}>
                            {city.label}
                          </option>
                        ))}
                      </select>
                      {errorMsg("djCity")}
                    </div>

                    <div>
                      <label className={labelCls}>
                        Цена за час{requiredMark}
                      </label>
                      <input
                        className={inputCls}
                        value={djPrice}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        onChange={(e) => setDjPrice(digitsOnly(e.target.value))}
                        placeholder="1500 ₽/час"
                      />
                      {errorMsg("djPrice")}
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>
                      Контакт (Telegram / ссылка){requiredMark}
                    </label>
                    <input
                      className={inputCls}
                      value={djContact}
                      onChange={(e) => setDjContact(e.target.value)}
                      placeholder="https://t.me/username"
                    />
                    {errorMsg("djContact")}
                  </div>

                  <div>
                    <label className={labelCls}>
                      Стили музыки{requiredMark}
                    </label>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {MUSIC_STYLES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleStyle(s, djStyles, setDjStyles)}
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                            djStyles.includes(s)
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-white/10 bg-white/5 text-muted-foreground hover:border-primary/50 hover:bg-primary/10"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    {errorMsg("djStyles")}
                  </div>

                  <div className="border-t border-border pt-3">
                    <p className="mb-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Дополнительно
                    </p>

                    <div className="space-y-3">
                      <div>
                        <label className={labelCls}>Био</label>
                        <textarea
                          className={inputCls + " h-16 resize-none"}
                          value={djBio}
                          maxLength={TEXT_LIMIT}
                          onChange={(e) => setDjBio(e.target.value.slice(0, TEXT_LIMIT))}
                          placeholder="Расскажи о себе"
                        />
                        <p className="mt-1 text-right text-[10px] text-muted-foreground">
                          {djBio.length}/{TEXT_LIMIT}
                        </p>
                        {errorMsg("djBio")}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className={labelCls}>Опыт</label>
                          <select
                            className={selectCls}
                            value={djExperience}
                            onChange={(e) => setDjExperience(e.target.value)}
                          >
                            {DJ_EXPERIENCE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className={labelCls}>Доступность</label>
                          <select
                            className={selectCls}
                            value={djAvailability}
                            onChange={(e) => setDjAvailability(e.target.value)}
                          >
                            {DJ_AVAILABILITY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className={labelCls}>Где играл (через запятую)</label>
                        <input
                          className={inputCls}
                          value={djPlayedAt}
                          onChange={(e) => setDjPlayedAt(e.target.value)}
                          placeholder="Мох, Midnight Club"
                        />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className={labelCls}>SoundCloud</label>
                          <input
                            className={inputCls}
                            value={djSoundcloud}
                            onChange={(e) => setDjSoundcloud(e.target.value)}
                            placeholder="Не обязательно"
                          />
                        </div>

                        <div>
                          <label className={labelCls}>Instagram</label>
                          <input
                            className={inputCls}
                            value={djInstagram}
                            onChange={(e) => setDjInstagram(e.target.value)}
                            placeholder="Не обязательно"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-4">
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                          <input
                            type="checkbox"
                            checked={djCollab}
                            onChange={(e) => setDjCollab(e.target.checked)}
                            className="rounded border-input accent-primary"
                          />
                          Коллаборации: Да
                        </label>

                        <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                          <input
                            type="checkbox"
                            checked={djCrew}
                            onChange={(e) => setDjCrew(e.target.checked)}
                            className="rounded border-input accent-primary"
                          />
                          Участие в crew: Да
                        </label>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className={labelCls}>
                      Название заведения{requiredMark}
                    </label>
                    <input
                      className={inputCls}
                      value={venueName}
                      onChange={(e) => setVenueName(e.target.value)}
                      placeholder="Мох"
                    />
                    {errorMsg("venueName")}
                  </div>

                  <div>
                    <label className={labelCls}>Фото</label>
                    <label className="group flex cursor-pointer items-center gap-3">
                      {venuePhotoPreview ? (
                        <img
                          src={venuePhotoPreview}
                          alt="preview"
                          className="h-20 w-20 shrink-0 rounded-xl border border-white/10 bg-black object-cover object-center"
                        />
                      ) : (
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-white/15 bg-[#0f1115] transition-colors group-hover:border-primary/50">
                          <Upload className="h-5 w-5 shrink-0 text-muted-foreground" />
                        </div>
                      )}
                      <span className="min-w-0 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
                        Загрузить фото (до 5 МБ)
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handlePhotoChange(e.target.files?.[0] || null, setVenuePhotoPreview)}
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelCls}>
                        Город{requiredMark}
                      </label>
                      <select
                        className={selectCls}
                        value={venueCity}
                        onChange={(e) => setVenueCity(e.target.value)}
                      >
                        <option value="">Выбрать</option>
                        {CITY_OPTIONS.map((city) => (
                          <option key={city.value} value={city.value}>
                            {city.label}
                          </option>
                        ))}
                      </select>
                      {errorMsg("venueCity")}
                    </div>

                    <div>
                      <label className={labelCls}>
                        Тип{requiredMark}
                      </label>
                      <select
                        className={selectCls}
                        value={venueType}
                        onChange={(e) => setVenueType(e.target.value)}
                      >
                        {VENUE_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {errorMsg("venueType")}
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>
                      Контакт (Telegram / ссылка){requiredMark}
                    </label>
                    <input
                      className={inputCls}
                      value={venueContact}
                      onChange={(e) => setVenueContact(e.target.value)}
                      placeholder="https://t.me/venue"
                    />
                    {errorMsg("venueContact")}
                  </div>

                  <div>
                    <label className={labelCls}>
                      Стили музыки{requiredMark}
                    </label>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {MUSIC_STYLES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleStyle(s, venueStyles, setVenueStyles)}
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                            venueStyles.includes(s)
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-white/10 bg-white/5 text-muted-foreground hover:border-primary/50 hover:bg-primary/10"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    {errorMsg("venueStyles")}
                  </div>

                  <div className="border-t border-border pt-3">
                    <p className="mb-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Дополнительно
                    </p>

                    <div className="space-y-3">
                      <div>
                        <label className={labelCls}>Описание</label>
                        <textarea
                          className={inputCls + " h-16 resize-none"}
                          value={venueDesc}
                          maxLength={TEXT_LIMIT}
                          onChange={(e) => setVenueDesc(e.target.value.slice(0, TEXT_LIMIT))}
                          placeholder="Расскажите о заведении"
                        />
                        <p className="mt-1 text-right text-[10px] text-muted-foreground">
                          {venueDesc.length}/{TEXT_LIMIT}
                        </p>
                        {errorMsg("venueDesc")}
                      </div>

                      <div>
                        <label className={labelCls}>Адрес</label>
                        <input
                          className={inputCls}
                          value={venueAddress}
                          onChange={(e) => setVenueAddress(e.target.value)}
                          placeholder="Улица, дом"
                        />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className={labelCls}>Оборудование</label>
                          <select
                            className={selectCls}
                            value={venueEquipment}
                            onChange={(e) => setVenueEquipment(e.target.value)}
                          >
                            {VENUE_EQUIPMENT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className={labelCls}>Условия</label>
                          <select
                            className={selectCls}
                            value={venueConditions}
                            onChange={(e) => setVenueConditions(e.target.value)}
                          >
                            {VENUE_CONDITIONS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="btn-glow w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? "Создание..." : "Создать профиль"}
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 bg-background px-6 py-10">
        <div className="mx-auto max-w-4xl space-y-6 text-center">
          <h2 className="text-xl font-bold">
            Уже на <span className="text-primary">DJHUB</span>
          </h2>

          {(role === "dj" ? previewDjs.length : previewVenues.length) > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {role === "dj"
                ? previewDjs.map((d) => <PreviewDjCard key={d.id} dj={d} />)
                : previewVenues.map((v) => <PreviewVenueCard key={v.id} venue={v} />)}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">РђРєС‚РёРІРЅС‹Рµ РїСЂРѕС„РёР»Рё СЃРєРѕСЂРѕ РїРѕСЏРІСЏС‚СЃСЏ</p>
          )}

          <button
            onClick={scrollToForm}
            className="rounded-xl border border-primary/30 bg-primary/5 px-6 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
          >
            Стать одним из них ↑
          </button>
        </div>
      </div>
    </div>
  );
};

export default Register;
