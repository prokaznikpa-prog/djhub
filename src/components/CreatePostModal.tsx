import { useState } from "react";

import { MUSIC_STYLES } from "@/data/djhub-data";

import { createVenuePost, type VenuePost } from "@/domains/posts/posts.hooks";

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

  const [eventDate, setEventDate] = useState("");

  const [startTime, setStartTime] = useState("");

  const [duration, setDuration] = useState("");

  const [requirements, setRequirements] = useState("");

  const [portfolioRequired, setPortfolioRequired] = useState(false);

  const [deadline, setDeadline] = useState("");

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



  const dateFieldErrors = {
    castingDate: postType === "casting" && submitAttempted && !deadline ? "Укажите дату кастинга" : "",
    castingTime: postType === "casting" && submitAttempted && !startTime ? "Укажите время" : "",
    residencyDate: postType === "residency" && submitAttempted && !eventDate ? "Укажите дату старта" : "",
    residencyTime: postType === "residency" && submitAttempted && !startTime ? "Укажите время" : "",
  };

  const hasGigFieldErrors = Object.values({ ...gigFieldErrors, ...dateFieldErrors }).some(Boolean);



  const toggleStyle = (s: string) => {

    setSelectedStyles((prev) =>

      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]

    );

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

    if (postType === "casting" && (!deadline || !startTime)) {
      toast.error("Укажите дату и время кастинга");
      return;
    }

    if (postType === "residency" && (!eventDate || !startTime)) {
      toast.error("Укажите дату и время старта резидентства");
      return;
    }



    setSaving(true);



    const { data, error } = await createVenuePost(

      toGigInsert({

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

      })

    );



    setSaving(false);



    if (error) {

      toast.error("Ошибка: " + error.message);

      return;

    }



    toast.success("Публикация создана!");

    onCreated((data as VenuePost | null) ?? undefined);

    onClose();

  };



  const inputCls = "premium-input";

  const selectCls = "djhub-select w-full text-sm";

  const labelCls = "mb-1.5 block text-xs font-semibold text-foreground/85";



  return (

    <div

      className="fixed inset-0 z-50 bg-background/75 backdrop-blur-md"

      onClick={onClose}

    >

      <div className="flex min-h-screen items-end justify-center px-0 py-0 sm:items-center sm:px-4 sm:py-4">

        <div

          className="profile-section premium-surface flex h-[100dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[1.5rem] p-0 sm:h-[92vh] sm:rounded-2xl"

          onClick={(e) => e.stopPropagation()}

        >

          <div className="flex items-start justify-between gap-4 border-b border-border/50 px-4 py-4 sm:px-6">

            <div>

              <p className="text-xs font-semibold uppercase text-primary">Публикация</p>

              <h2 className="mt-1 text-lg font-bold text-foreground">Создать публикацию</h2>

            </div>



            <button

              onClick={onClose}

              type="button"

              className="rounded-lg border border-white/10 bg-background/45 p-1.5 text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"

            >

              <X className="h-4 w-4" />

            </button>

          </div>



          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">

            <div className="space-y-5">

              <div>

                <label className={labelCls}>Тип</label>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">

                  {GIG_TYPES.map((t) => (

                    <button

                      key={t.value}

                      onClick={() => setPostType(t.value)}

                      type="button"

                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${

                        postType === t.value

                          ? "border-primary bg-primary/10 text-primary shadow-sm shadow-primary/20"

                          : "border-border/60 bg-background/35 text-muted-foreground hover:border-primary/30 hover:text-foreground"

                      }`}

                    >

                      {t.label}

                    </button>

                  ))}

                </div>

              </div>



              <div>

                <label className={labelCls}>Название</label>

                <input

                  className={inputCls}

                  value={title}

                  onChange={(e) => setTitle(e.target.value)}

                  placeholder="DJ Night / Open Call / Резидент-программа"

                />

              </div>



              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">

                <div>

                  <label className={labelCls}>Город</label>

                  <select

                    className={selectCls}

                    value={city}

                    onChange={(e) => setCity(e.target.value)}

                  >

                    <option value="">Выбрать</option>

                    {CITY_OPTIONS.map((option) => (

                      <option key={option.value} value={option.value}>

                        {option.label}

                      </option>

                    ))}

                  </select>

                </div>



                <div>

                  <label className={labelCls}>Бюджет</label>

                  <input

                    className={inputCls}

                    value={budget}

                    inputMode="numeric"

                    pattern="[0-9]*"

                    onChange={(e) => setBudget(digitsOnly(e.target.value))}

                    placeholder="5 000 ₽"

                  />

                  {gigFieldErrors.budget && (

                    <p className="mt-1 text-[10px] text-destructive">{gigFieldErrors.budget}</p>

                  )}

                </div>

              </div>



              <div>

                <label className={labelCls}>Стили</label>

                <div className="flex flex-wrap gap-1.5 rounded-xl border border-border/40 bg-background/25 p-3">

                  {MUSIC_STYLES.map((s) => (

                    <button

                      key={s}

                      onClick={() => toggleStyle(s)}

                      type="button"

                      className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${

                        selectedStyles.includes(s)

                          ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"

                          : "border border-white/10 bg-white/10 text-foreground/70 hover:border-primary/40 hover:text-foreground"

                      }`}

                    >

                      {s}

                    </button>

                  ))}

                </div>

              </div>



              {postType === "gig" && (

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">

                  <div>

                    <label className={labelCls}>Дата</label>

                    <input

                      type="date"

                      className={inputCls}

                      value={eventDate}

                      onChange={(e) => setEventDate(e.target.value)}

                    />

                    {gigFieldErrors.eventDate && (

                      <p className="mt-1 text-[10px] text-destructive">{gigFieldErrors.eventDate}</p>

                    )}

                  </div>



                  <div>

                    <label className={labelCls}>Время</label>

                    <input

                      type="time"

                      min="00:00"

                      max="23:59"

                      step="300"

                      className={inputCls}

                      value={startTime}

                      onChange={(e) => setStartTime(e.target.value)}

                    />

                    {gigFieldErrors.startTime && (

                      <p className="mt-1 text-[10px] text-destructive">{gigFieldErrors.startTime}</p>

                    )}

                  </div>



                  <div>

                    <label className={labelCls}>Длительность</label>

                    <select

                      className={selectCls}

                      value={duration}

                      onChange={(e) => setDuration(e.target.value)}

                    >

                      <option value="">Выбрать</option>

                      {GIG_DURATION_OPTIONS.map((option) => (

                        <option key={option.value} value={option.value}>

                          {option.label}

                        </option>

                      ))}

                    </select>

                    {gigFieldErrors.duration && (

                      <p className="mt-1 text-[10px] text-destructive">{gigFieldErrors.duration}</p>

                    )}

                  </div>

                </div>

              )}



              {postType === "casting" && (

                <div className="space-y-3">

                  <div>

                    <label className={labelCls}>Требования</label>

                    <textarea

                      className={inputCls + " h-16 resize-none"}

                      value={requirements}

                      onChange={(e) => setRequirements(e.target.value)}

                      placeholder="Опыт от 1 года..."

                    />

                  </div>



                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">

                    <div>

                      <label className={labelCls}>Дедлайн</label>

                      <input

                        type="date"

                        className={inputCls}

                        value={deadline}

                        onChange={(e) => setDeadline(e.target.value)}

                      />

                      {dateFieldErrors.castingDate && (
                        <p className="mt-1 text-[10px] text-destructive">{dateFieldErrors.castingDate}</p>
                      )}

                    </div>



                    <div>
                      <label className={labelCls}>Время</label>
                      <input
                        type="time"
                        min="00:00"
                        max="23:59"
                        step="300"
                        className={inputCls}
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                      />
                      {dateFieldErrors.castingTime && (
                        <p className="mt-1 text-[10px] text-destructive">{dateFieldErrors.castingTime}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1 md:col-span-2">

                      <input

                        type="checkbox"

                        checked={portfolioRequired}

                        onChange={(e) => setPortfolioRequired(e.target.checked)}

                        className="rounded"

                      />

                      <span className="text-xs text-muted-foreground">

                        Портфолио обязательно

                      </span>

                    </div>

                  </div>

                </div>

              )}



              {postType === "residency" && (

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">

                  <div>
                    <label className={labelCls}>Дата старта</label>
                    <input
                      type="date"
                      className={inputCls}
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                    />
                    {dateFieldErrors.residencyDate && (
                      <p className="mt-1 text-[10px] text-destructive">{dateFieldErrors.residencyDate}</p>
                    )}
                  </div>

                  <div>
                    <label className={labelCls}>Время старта</label>
                    <input
                      type="time"
                      min="00:00"
                      max="23:59"
                      step="300"
                      className={inputCls}
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                    {dateFieldErrors.residencyTime && (
                      <p className="mt-1 text-[10px] text-destructive">{dateFieldErrors.residencyTime}</p>
                    )}
                  </div>

                  <div>

                    <label className={labelCls}>Расписание</label>

                    <select

                      className={selectCls}

                      value={schedule}

                      onChange={(e) => setSchedule(e.target.value)}

                    >

                      <option value="">Выбрать</option>

                      {RESIDENCY_SCHEDULE_OPTIONS.map((option) => (

                        <option key={option.value} value={option.value}>

                          {option.label}

                        </option>

                      ))}

                    </select>

                  </div>



                  <div>

                    <label className={labelCls}>Частота</label>

                    <select

                      className={selectCls}

                      value={frequency}

                      onChange={(e) => setFrequency(e.target.value)}

                    >

                      <option value="">Выбрать</option>

                      {RESIDENCY_FREQUENCY_OPTIONS.map((option) => (

                        <option key={option.value} value={option.value}>

                          {option.label}

                        </option>

                      ))}

                    </select>

                  </div>

                </div>

              )}



              <div>

                <label className={labelCls}>Описание</label>

                <textarea

                  className={inputCls + " min-h-[120px] resize-none"}

                  value={description}

                  maxLength={DESCRIPTION_LIMIT}

                  onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_LIMIT))}

                  placeholder="Дополнительная информация..."

                />

                <p className="mt-1 text-right text-[10px] text-muted-foreground">

                  {description.length}/{DESCRIPTION_LIMIT}

                </p>

              </div>

            </div>

          </div>



          <div className="border-t border-border/50 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">

            <button

              onClick={handleSubmit}

              disabled={saving || (submitAttempted && hasGigFieldErrors)}

              type="button"

              className="btn-glow w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"

            >

              {saving ? "Сохраняем..." : "Создать"}

            </button>

          </div>

        </div>

      </div>

    </div>

  );

};



export default CreatePostModal;
