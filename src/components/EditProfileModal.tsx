import { useEffect, useMemo, useState } from "react";
import { MUSIC_STYLES } from "@/data/djhub-data";
import { updateDjProfile, updateVenueProfile } from "@/domains/profiles/profiles.hooks";
import { X, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { DjProfile, VenueProfile } from "@/lib/profile";
import { CITY_OPTIONS } from "@/lib/geography";
import {
  DJ_AVAILABILITY_OPTIONS,
  DJ_EXPERIENCE_OPTIONS,
} from "@/lib/djOptions";
import {
  VENUE_TYPE_OPTIONS,
  VENUE_EQUIPMENT_OPTIONS,
  VENUE_CONDITIONS_OPTIONS,
} from "@/lib/venueOptions";
import { getCachedValue, setCachedValue } from "@/lib/requestCache";
import type { Tables } from "@/integrations/supabase/types";
import PhotoCropModal from "@/components/PhotoCropModal";
import { useAuth } from "@/hooks/useAuth";
import { validateDjPrice, validateProfileName } from "@/lib/profileNameValidation";

interface Props {
  type: "dj" | "venue";
  djProfile?: DjProfile | null;
  venueProfile?: VenueProfile | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const TEXT_LIMIT = 200;
const MAX_STYLES = 5;
const PROFILE_CACHE_TTL = 90_000;
const digitsOnly = (value: string) => value.replace(/\D/g, "");

const patchCachedProfile = <TProfile extends { id: string }>(cacheKey: string, profileKey: string, id: string, updates: Partial<TProfile>) => {
  const currentProfile = getCachedValue<TProfile>(profileKey, { allowStale: true });
  if (currentProfile) {
    setCachedValue(profileKey, { ...currentProfile, ...updates }, PROFILE_CACHE_TTL);
  }

  const currentList = getCachedValue<TProfile[]>(cacheKey, { allowStale: true });
  if (currentList) {
    setCachedValue(cacheKey, currentList.map((item) => item.id === id ? { ...item, ...updates } : item), PROFILE_CACHE_TTL);
  }
};

const EditProfileModal = ({
  type,
  djProfile,
  venueProfile,
  onClose,
  onSaved,
}: Props) => {
  const { applyProfilePatch } = useAuth();
  const [saving, setSaving] = useState(false);

  const [djName, setDjName] = useState("");
  const [djCity, setDjCity] = useState("");
  const [djContact, setDjContact] = useState("");
  const [djStyles, setDjStyles] = useState<string[]>([]);
  const [djPrice, setDjPrice] = useState("");
  const [djBio, setDjBio] = useState("");
  const [djExperience, setDjExperience] = useState("");
  const [djPlayedAt, setDjPlayedAt] = useState("");
  const [djAvailability, setDjAvailability] = useState("");
  const [djCollab, setDjCollab] = useState(false);
  const [djCrew, setDjCrew] = useState(false);
  const [djPhoto, setDjPhoto] = useState<string | null>(null);

  const [vName, setVName] = useState("");
  const [vCity, setVCity] = useState("");
  const [vType, setVType] = useState("");
  const [vContact, setVContact] = useState("");
  const [vDesc, setVDesc] = useState("");
  const [vAddress, setVAddress] = useState("");
  const [vEquipment, setVEquipment] = useState("");
  const [vConditions, setVConditions] = useState("");
  const [vStyles, setVStyles] = useState<string[]>([]);
  const [vPhoto, setVPhoto] = useState<string | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<"dj" | "venue" | null>(null);

  useEffect(() => {
    if (type === "dj") {
      setDjName(djProfile?.name || "");
      setDjCity(djProfile?.city || "");
      setDjContact(djProfile?.contact || "");
      setDjStyles(djProfile?.styles || []);
      setDjPrice(digitsOnly(djProfile?.price || ""));
      setDjBio(djProfile?.bio || "");
      setDjExperience(djProfile?.experience || "");
      setDjPlayedAt((djProfile?.playedAt || djProfile?.played_at || []).join(", "));
      setDjAvailability(djProfile?.availability || "");
      setDjCollab(Boolean(djProfile?.openToCollab ?? djProfile?.open_to_collab));
      setDjCrew(Boolean(djProfile?.openToCrew ?? djProfile?.open_to_crew));
      setDjPhoto(djProfile?.image || djProfile?.image_url || djProfile?.avatar || null);
      return;
    }

    setVName(venueProfile?.name || "");
    setVCity(venueProfile?.city || "");
    setVType(venueProfile?.type || "");
    setVContact(venueProfile?.contact || "");
    setVDesc(venueProfile?.description || "");
    setVAddress(venueProfile?.address || "");
    setVEquipment(venueProfile?.equipment || "");
    setVConditions(venueProfile?.foodDrinks || venueProfile?.food_drinks || "");
    setVStyles(venueProfile?.music || venueProfile?.music_styles || []);
    setVPhoto(venueProfile?.image || venueProfile?.image_url || venueProfile?.avatar || null);
  }, [type, djProfile, venueProfile]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving && !cropImageSrc) onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving, cropImageSrc]);

  const inputCls =
    "premium-input";
  const selectCls = "djhub-select w-full text-sm";
  const labelCls = "block mb-1.5 text-xs font-semibold text-foreground/85";

  const currentStyleCount = useMemo(
    () => (type === "dj" ? djStyles.length : vStyles.length),
    [type, djStyles.length, vStyles.length]
  );

  const handlePhoto = (
    file: File | null,
    target: "dj" | "venue"
  ) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Нужен файл изображения");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Максимальный размер файла — 5 МБ");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropTarget(target);
      setCropImageSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCropSave = (croppedImage: string) => {
    if (cropTarget === "dj") setDjPhoto(croppedImage);
    if (cropTarget === "venue") setVPhoto(croppedImage);
    setCropImageSrc(null);
    setCropTarget(null);
  };

  const closeCropper = () => {
    setCropImageSrc(null);
    setCropTarget(null);
  };

  const toggleStyle = (
    style: string,
    selected: string[],
    setter: (value: string[]) => void
  ) => {
    if (selected.includes(style)) {
      setter(selected.filter((item) => item !== style));
      return;
    }

    if (selected.length >= MAX_STYLES) {
      toast.error(`Можно выбрать максимум ${MAX_STYLES} стилей`);
      return;
    }

    setter([...selected, style]);
  };

  const handleSave = async () => {
    if (saving) return;

    try {
      setSaving(true);

      if (type === "dj") {
        const djNameError = validateProfileName(djName);
        if (djNameError) {
          toast.error(djNameError);
          return;
        }

        if (!djName.trim() || !djCity.trim()) {
          toast.error("Имя и город обязательны");
          return;
        }

        if (!djContact.trim()) {
          toast.error("Контакт обязателен");
          return;
        }

        const djPriceError = validateDjPrice(djPrice);
        if (djPriceError) {
          toast.error(djPriceError);
          return;
        }

        const updated = await updateDjProfile({
          name: djName.trim(),
          city: djCity,
          contact: djContact.trim(),
          styles: djStyles,
          priorityStyle: djStyles[0] || "",
          price: djPrice.trim(),
          bio: djBio.trim(),
          experience: djExperience,
          playedAt: djPlayedAt
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          availability: djAvailability,
          openToCollab: djCollab,
          openToCrew: djCrew,
          image: djPhoto || "",
        });
        if (updated) {
          applyProfilePatch("dj", updated);
          patchCachedProfile<Tables<"dj_profiles">>("catalog:djs:active", `dj:${updated.id}`, updated.id, {
            name: djName.trim(),
            city: djCity,
            contact: djContact.trim(),
            styles: djStyles,
            priority_style: djStyles[0] || null,
            price: djPrice.trim(),
            bio: djBio.trim() || null,
            experience: djExperience || null,
            played_at: djPlayedAt.split(",").map((item) => item.trim()).filter(Boolean),
            availability: djAvailability || null,
            open_to_collab: djCollab,
            open_to_crew: djCrew,
            image_url: djPhoto || null,
            is_verified: updated.is_verified,
          });
        }
      } else {
        const venueNameError = validateProfileName(vName);
        if (venueNameError) {
          toast.error(venueNameError);
          return;
        }

        if (!vName.trim() || !vCity.trim()) {
          toast.error("Название и город обязательны");
          return;
        }

        if (!vType) {
          toast.error("Выбери тип заведения");
          return;
        }

        if (!vContact.trim()) {
          toast.error("Контакт обязателен");
          return;
        }

        const updated = await updateVenueProfile({
          name: vName.trim(),
          city: vCity,
          type: vType,
          contact: vContact.trim(),
          description: vDesc.trim(),
          address: vAddress.trim() || undefined,
          equipment: vEquipment,
          foodDrinks: vConditions,
          music: vStyles,
          image: vPhoto || "",
        });
        if (updated) {
          applyProfilePatch("venue", updated);
          patchCachedProfile<Tables<"venue_profiles">>("catalog:venues:active", `venue:${updated.id}`, updated.id, {
            name: vName.trim(),
            city: vCity,
            type: vType,
            contact: vContact.trim(),
            description: vDesc.trim() || null,
            address: vAddress.trim() || null,
            equipment: vEquipment || null,
            food_drinks: vConditions || null,
            music_styles: vStyles,
            image_url: vPhoto || null,
            is_verified: updated.is_verified,
          });
        }
      }

      toast.success("Профиль обновлён");
      onClose();
      void Promise.resolve(onSaved());
    } catch (error) {
      console.error(error);
      toast.error("Не удалось сохранить профиль");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/82 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="profile-section premium-surface flex max-h-[100dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[1.5rem] p-0 sm:max-h-[90vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-7 sm:py-5">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">Профиль</p>
            <h2 className="mt-1 text-xl font-bold text-foreground">
              Редактировать профиль
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-background/45 p-1.5 text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-7 sm:py-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:[&>*]:col-span-2">
          {type === "dj" ? (
            <>
              <div className="lg:col-span-2">
                <label className={labelCls}>DJ имя</label>
                <input
                  className={inputCls}
                  value={djName}
                  onChange={(e) => setDjName(e.target.value)}
                  placeholder="Например: Danek"
                />
              </div>

              <div>
                <label className={labelCls}>Фото</label>

                <div className="rounded-2xl border border-white/10 bg-[#0f1115] p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="group flex min-w-0 cursor-pointer flex-wrap items-center gap-3">
                    {djPhoto ? (
                      <img
                        src={djPhoto}
                        alt="DJ preview"
                        className="h-20 w-20 rounded-xl border border-white/10 bg-black object-cover object-center shadow-lg shadow-black/20"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-white/15 bg-background/70 transition-colors group-hover:border-primary/40">
                        <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </div>
                    )}

                    <span className="min-w-0 text-xs text-muted-foreground">
                      {djPhoto ? "Изменить фото" : "Загрузить фото"}
                    </span>

                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        {
                          handlePhoto(e.target.files?.[0] || null, "dj");
                          e.currentTarget.value = "";
                        }
                      }
                    />
                  </label>

                  {djPhoto && (
                    <button
                      type="button"
                      onClick={() => setDjPhoto(null)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-background/70 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5 shrink-0" />
                      Удалить
                    </button>
                  )}
                </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Город</label>
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
                </div>

                <div>
                  <label className={labelCls}>Цена</label>
                  <input
                    className={inputCls}
                    value={djPrice}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    onChange={(e) => setDjPrice(digitsOnly(e.target.value))}
                    placeholder="Например: 10 000 ₽"
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Контакт</label>
                <input
                  className={inputCls}
                  value={djContact}
                  onChange={(e) => setDjContact(e.target.value)}
                  placeholder="@telegram / телефон / email"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className={labelCls}>Стили</label>
                  <span className="text-[10px] text-muted-foreground">
                    {currentStyleCount}/{MAX_STYLES}
                  </span>
                </div>

                <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-2xl border border-white/10 bg-[#0f1115] p-4">
                  {MUSIC_STYLES.map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() =>
                        toggleStyle(style, djStyles, setDjStyles)
                      }
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                        djStyles.includes(style)
                          ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                          : "border-white/10 bg-white/10 text-foreground/70 hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelCls}>Био</label>
                <textarea
                  className={inputCls + " min-h-24 resize-none"}
                  value={djBio}
                  maxLength={TEXT_LIMIT}
                  onChange={(e) =>
                    setDjBio(e.target.value.slice(0, TEXT_LIMIT))
                  }
                  placeholder="Коротко о себе"
                />
                <p className="mt-1 text-right text-[10px] text-muted-foreground">
                  {djBio.length}/{TEXT_LIMIT}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
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
                <label className={labelCls}>Где играл</label>
                <input
                  className={inputCls}
                  value={djPlayedAt}
                  onChange={(e) => setDjPlayedAt(e.target.value)}
                  placeholder="Place 1, Place 2, Place 3"
                />
              </div>

              <div className="flex flex-wrap gap-4 rounded-2xl border border-white/10 bg-[#0f1115] p-4">
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={djCollab}
                    onChange={(e) => setDjCollab(e.target.checked)}
                    className="accent-primary"
                  />
                  Коллаборации
                </label>

                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={djCrew}
                    onChange={(e) => setDjCrew(e.target.checked)}
                    className="accent-primary"
                  />
                  Участие в crew
                </label>
              </div>
            </>
          ) : (
            <>
              <div className="lg:col-span-2">
                <label className={labelCls}>Название</label>
                <input
                  data-testid="venue-name-input"
                  className={inputCls}
                  value={vName}
                  onChange={(e) => setVName(e.target.value)}
                  placeholder="Название заведения"
                />
              </div>

              <div>
                <label className={labelCls}>Фото</label>

                <div className="rounded-2xl border border-white/10 bg-[#0f1115] p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="group flex min-w-0 cursor-pointer flex-wrap items-center gap-3">
                    {vPhoto ? (
                      <img
                        src={vPhoto}
                        alt="Venue preview"
                        className="h-20 w-20 rounded-xl border border-white/10 bg-black object-cover object-center shadow-lg shadow-black/20"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-white/15 bg-background/70 transition-colors group-hover:border-primary/40">
                        <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </div>
                    )}

                    <span className="min-w-0 text-xs text-muted-foreground">
                      {vPhoto ? "Изменить фото" : "Загрузить фото"}
                    </span>

                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        {
                          handlePhoto(e.target.files?.[0] || null, "venue");
                          e.currentTarget.value = "";
                        }
                      }
                    />
                  </label>

                  {vPhoto && (
                    <button
                      type="button"
                      onClick={() => setVPhoto(null)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-background/70 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5 shrink-0" />
                      Удалить
                    </button>
                  )}
                </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Город</label>
                  <select
                    className={selectCls}
                    value={vCity}
                    onChange={(e) => setVCity(e.target.value)}
                  >
                    <option value="">Выбрать</option>
                    {CITY_OPTIONS.map((city) => (
                      <option key={city.value} value={city.value}>
                        {city.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Тип</label>
                  <select
                    className={selectCls}
                    value={vType}
                    onChange={(e) => setVType(e.target.value)}
                  >
                    {VENUE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelCls}>Контакт</label>
                <input
                  data-testid="venue-contact-input"
                  className={inputCls}
                  value={vContact}
                  onChange={(e) => setVContact(e.target.value)}
                  placeholder="@telegram / телефон / email"
                />
              </div>

              <div>
                <label className={labelCls}>Описание</label>
                <textarea
                  className={inputCls + " min-h-24 resize-none"}
                  value={vDesc}
                  maxLength={TEXT_LIMIT}
                  onChange={(e) =>
                    setVDesc(e.target.value.slice(0, TEXT_LIMIT))
                  }
                  placeholder="Коротко о заведении"
                />
                <p className="mt-1 text-right text-[10px] text-muted-foreground">
                  {vDesc.length}/{TEXT_LIMIT}
                </p>
              </div>

              <div>
                <label className={labelCls}>Адрес</label>
                <input
                  className={inputCls}
                  value={vAddress}
                  onChange={(e) => setVAddress(e.target.value)}
                  placeholder="Адрес"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Оборудование</label>
                  <select
                    className={selectCls}
                    value={vEquipment}
                    onChange={(e) => setVEquipment(e.target.value)}
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
                    value={vConditions}
                    onChange={(e) => setVConditions(e.target.value)}
                  >
                    {VENUE_CONDITIONS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className={labelCls}>Стили музыки</label>
                  <span className="text-[10px] text-muted-foreground">
                    {currentStyleCount}/{MAX_STYLES}
                  </span>
                </div>

                <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-2xl border border-white/10 bg-[#0f1115] p-4">
                  {MUSIC_STYLES.map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() =>
                        toggleStyle(style, vStyles, setVStyles)
                      }
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                        vStyles.includes(style)
                          ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                          : "border-white/10 bg-white/10 text-foreground/70 hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          </div>
        </div>

        <div className="shrink-0 border-t border-white/10 bg-[#171a20] px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-7">
            <button
              data-testid="profile-save-button"
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-glow w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
        </div>
      </div>

      {cropImageSrc && (
        <PhotoCropModal
          imageSrc={cropImageSrc}
          onCancel={closeCropper}
          onSave={handleCropSave}
        />
      )}
    </div>
  );
};

export default EditProfileModal;


