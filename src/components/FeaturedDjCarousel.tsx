import { useState, useCallback, useEffect, useRef } from "react";
import type { DJ } from "@/data/djhub-data";
import { Link } from "react-router-dom";
import { MapPin, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { getCityLabel } from "@/lib/geography";

interface Props {
  djs: DJ[];
}

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const DURATION = 700; // ms

const FeaturedDjCarousel = ({ djs }: Props) => {
  const [active, setActive] = useState(0);
  const [locked, setLocked] = useState(false);
  const len = djs.length;
  const touchRef = useRef<number | null>(null);

  useEffect(() => {
    if (active >= len && len > 0) setActive(0);
  }, [len, active]);

  const go = useCallback(
    (dir: number) => {
      if (locked || len <= 1) return;
      setLocked(true);
      setActive((i) => (i + dir + len) % len);
    },
    [locked, len],
  );

  useEffect(() => {
    if (!locked) return;
    const t = setTimeout(() => setLocked(false), DURATION + 50);
    return () => clearTimeout(t);
  }, [locked, active]);

  if (len === 0) return null;

  const idx = (offset: number) => (active + offset + len) % len;

  const slots = [
    { offset: -2, tx: -145, s: 0.52, o: 0.1, blur: 5, z: 0, mob: false },
    { offset: -1, tx: -74, s: 0.78, o: 0.35, blur: 2.5, z: 10, mob: true },
    { offset: 0, tx: 0, s: 1, o: 1, blur: 0, z: 20, mob: true },
    { offset: 1, tx: 74, s: 0.78, o: 0.35, blur: 2.5, z: 10, mob: true },
    { offset: 2, tx: 145, s: 0.52, o: 0.1, blur: 5, z: 0, mob: false },
  ];

  const onTouchStart = (e: React.TouchEvent) => {
    touchRef.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchRef.current === null) return;
    const d = e.changedTouches[0].clientX - touchRef.current;
    if (Math.abs(d) > 40) go(d < 0 ? 1 : -1);
    touchRef.current = null;
  };

  const maxDots = 11;

  return (
    <div className="select-none" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="relative">
        <div className="flex items-center justify-center h-[400px] sm:h-[450px] overflow-hidden">
          {slots.map(({ offset, tx, s, o, blur, z, mob }) => {
            const dj = djs[idx(offset)];
            return (
              <div
                key={`s${offset}`}
                className={!mob ? "hidden lg:block" : undefined}
                style={{
                  position: "absolute",
                  width: "clamp(260px, 28vw, 340px)",
                  transform: `translateX(${tx}%) scale(${s})`,
                  opacity: o,
                  filter: blur ? `blur(${blur}px)` : "none",
                  zIndex: z,
                  transition: `transform ${DURATION}ms ${EASE}, opacity ${DURATION}ms ${EASE}, filter ${DURATION}ms ${EASE}`,
                  willChange: "transform, opacity, filter",
                  pointerEvents: offset === 0 ? "auto" : "none",
                }}
              >
                <CarouselCard dj={dj} isCenter={offset === 0} />
              </div>
            );
          })}
        </div>

        {/* Arrows */}
        <button
          onClick={() => go(-1)}
          className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 z-30 rounded-full bg-card/80 border border-border/40 p-2.5 text-muted-foreground backdrop-blur-sm transition-all duration-200 hover:text-primary hover:border-primary/30 hover:bg-card hover:scale-110 active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={() => go(1)}
          className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 z-30 rounded-full bg-card/80 border border-border/40 p-2.5 text-muted-foreground backdrop-blur-sm transition-all duration-200 hover:text-primary hover:border-primary/30 hover:bg-card hover:scale-110 active:scale-95"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* Dots */}
        <div className="flex justify-center items-center gap-1.5 mt-6">
          {len <= maxDots ? (
            djs.map((_, i) => (
              <button
                key={i}
                onClick={() => !locked && setActive(i)}
                className={`h-1.5 rounded-full transition-all duration-500 ease-out ${
                  i === active ? "w-7 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground/50"
                }`}
              />
            ))
          ) : (
            <span className="text-[11px] text-muted-foreground font-mono">
              {active + 1} / {len}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const CarouselCard = ({ dj, isCenter }: { dj: DJ; isCenter: boolean }) => (
  <div
    className={`rounded-2xl overflow-hidden border ${
      isCenter
        ? "bg-card/90 border-primary/20 shadow-[0_12px_50px_-12px_hsl(142_71%_45%/0.18),0_8px_30px_-6px_hsl(0_0%_0%/0.5)]"
        : "bg-card/30 border-border/20"
    }`}
    style={{
      transition: `box-shadow 700ms ${EASE}, border-color 700ms ${EASE}, background 700ms ${EASE}`,
    }}
  >
    <div className="aspect-[16/9] overflow-hidden">
      <img src={dj.image} alt={dj.name} className="h-full w-full object-cover" loading="eager" />
    </div>
    <div className="px-4 py-3.5 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground truncate">{dj.name}</h3>
        <span className="text-xs font-mono text-primary shrink-0 ml-2">{dj.price}</span>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3 opacity-60" />
        <span className="truncate">{getCityLabel(dj.city)}</span>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {dj.styles.slice(0, 3).map((s) => (
          <span key={s} className="rounded-full bg-primary/8 px-2 py-0.5 text-[10px] font-medium text-primary/80">
            {s}
          </span>
        ))}
      </div>
      {isCenter && (
        <>
          <p className="text-xs text-muted-foreground/70 line-clamp-2 leading-relaxed">{dj.bio}</p>
          <div className="flex gap-2 pt-1">
            <Link
              to={`/dj/${dj.id}`}
              className="flex-1 rounded-xl bg-primary py-2 text-center text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Профиль
            </Link>
            <a
              href={dj.contact}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-border/50 bg-card px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-primary hover:border-primary/30"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </>
      )}
    </div>
  </div>
);

export default FeaturedDjCarousel;
