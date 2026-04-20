import { useEffect, useMemo, useState } from "react";
import { MUSIC_STYLES } from "@/data/djhub-data";
import { updateDjProfile, updateVenueProfile } from "@/data/store";
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

interface Props {
  type: "dj" | "venue";
  djProfile?: DjProfile | null;
  venueProfile?: VenueProfile | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const TEXT_LIMIT = 200;
const MAX_STYLES = 5;
const digitsOnly = (value: string) => value.replace(/\D/g, "");

const EditProfileModal = ({
  type,
  djProfile,
  venueProfile,
  onClose,
  onSaved,
}: Props) => {
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
      if (event.key === "Escape" && !saving) onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

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
    setter: (value: string | null) => void
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
    reader.onload = () => setter(reader.result as string);
    reader.readAsDataURL(file);
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
        if (!djName.trim() || !djCity.trim()) {
          toast.error("Имя и город обязательны");
          return;
        }

        if (!djContact.trim()) {
          toast.error("Контакт обязателен");
          return;
        }

        await updateDjProfile({
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
      } else {
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

        await updateVenueProfile({
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
      }

      toast.success("Профиль обновлён");
      await onSaved();
      onClose();
    } catch (error) {
      console.error(error);
      toast.error("Не удалось сохранить профиль");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 px-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="profile-section max-h-[85vh] w-full max-w-2xl overflow-y-auto premium-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4 border-b border-border/50 pb-4">
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

        <div className="space-y-5">
          {type === "dj" ? (
            <>
              <div>
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

                <div className="flex items-center gap-3">
                  <label className="group flex cursor-pointer items-center gap-3">
                    {djPhoto ? (
                      <img
                        src={djPhoto}
                        alt="DJ preview"
                        className="h-16 w-16 rounded-lg border border-border/60 bg-black object-cover shadow-lg shadow-black/20"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/50 transition-colors group-hover:border-primary/40">
                        <Upload className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}

                    <span className="text-xs text-muted-foreground">
                      {djPhoto ? "Изменить фото" : "Загрузить фото"}
                    </span>

                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        handlePhoto(e.target.files?.[0] || null, setDjPhoto)
                      }
                    />
                  </label>

                  {djPhoto && (
                    <button
                      type="button"
                      onClick={() => setDjPhoto(null)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/45 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Удалить
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
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

                <div className="flex flex-wrap gap-1.5 rounded-xl border border-border/40 bg-background/25 p-3">
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
                  className={inputCls + " h-16 resize-none"}
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

              <div className="grid grid-cols-2 gap-3">
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

              <div className="flex gap-6">
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
              <div>
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

                <div className="flex items-center gap-3">
                  <label className="group flex cursor-pointer items-center gap-3">
                    {vPhoto ? (
                      <img
                        src={vPhoto}
                        alt="Venue preview"
                        className="h-16 w-16 rounded-lg border border-border/60 bg-black object-cover shadow-lg shadow-black/20"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/50 transition-colors group-hover:border-primary/40">
                        <Upload className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}

                    <span className="text-xs text-muted-foreground">
                      {vPhoto ? "Изменить фото" : "Загрузить фото"}
                    </span>

                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        handlePhoto(e.target.files?.[0] || null, setVPhoto)
                      }
                    />
                  </label>

                  {vPhoto && (
                    <button
                      type="button"
                      onClick={() => setVPhoto(null)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/45 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Удалить
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                  className={inputCls + " h-16 resize-none"}
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

              <div className="grid grid-cols-2 gap-3">
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

                <div className="flex flex-wrap gap-1.5 rounded-xl border border-border/40 bg-background/25 p-3">
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

          <button
  data-testid="profile-save-button"
  type="button"
  onClick={handleSave}
  disabled={saving}
  className="btn-glow mt-2 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
>
  {saving ? "Сохранение..." : "Сохранить"}
</button>
        </div>
      </div>
    </div>
  );
};

export default EditProfileModal;
