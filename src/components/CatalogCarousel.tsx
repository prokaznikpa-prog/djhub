import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CatalogCarouselProps<T> {
  items: T[];
  loading?: boolean;
  variant: "dj" | "venue";
  getKey: (item: T) => string;
  renderItem: (item: T, index: number, isActive: boolean) => ReactNode;
}

const SKELETON_COUNT = 6;

const CatalogCarousel = <T,>({
  items,
  loading = false,
  variant,
  getKey,
  renderItem,
}: CatalogCarouselProps<T>) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [edgeState, setEdgeState] = useState({ left: true, right: false });

  const updateScrollState = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;

    const maxScroll = node.scrollWidth - node.clientWidth;
    const left = node.scrollLeft <= 8;
    const right = node.scrollLeft >= maxScroll - 8;

    setEdgeState((current) =>
      current.left === left && current.right === right ? current : { left, right }
    );

    const center = node.scrollLeft + node.clientWidth / 2;
    let nextIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    Array.from(node.children).forEach((child, index) => {
      const element = child as HTMLElement;
      const childCenter = element.offsetLeft + element.offsetWidth / 2;
      const distance = Math.abs(center - childCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        nextIndex = index;
      }
    });

    setActiveIndex((current) => (current === nextIndex ? current : nextIndex));
  }, []);

  const onScroll = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      updateScrollState();
    });
  }, [updateScrollState]);

  useEffect(() => {
    updateScrollState();
    window.addEventListener("resize", updateScrollState);
    return () => {
      window.removeEventListener("resize", updateScrollState);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [items.length, loading, updateScrollState]);

  const scrollByPage = useCallback((direction: -1 | 1) => {
    const node = scrollerRef.current;
    if (!node) return;

    if (variant === "dj") {
      const nextIndex = Math.min(Math.max(activeIndex + direction, 0), items.length - 1);
      const nextItem = node.children[nextIndex] as HTMLElement | undefined;
      nextItem?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      return;
    }

    node.scrollBy({
      left: direction * Math.max(node.clientWidth * 0.82, 280),
      behavior: "smooth",
    });
  }, [activeIndex, items.length, variant]);

  const widthClass =
    variant === "dj"
      ? "w-[74vw] max-w-[285px] sm:w-[300px] lg:w-[320px]"
      : "w-[78vw] max-w-[305px] sm:w-[320px] lg:w-[340px]";

  const itemsToRender = loading ? Array.from({ length: SKELETON_COUNT }) : items;
  const isDjShowcase = variant === "dj";

  return (
    <div
      className={
        isDjShowcase
          ? "relative mx-auto max-w-7xl rounded-[28px] bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.10),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.035),transparent)] px-0"
          : "relative"
      }
    >
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className={`carousel-scrollbar flex snap-x snap-mandatory overflow-x-auto scroll-smooth ${
          isDjShowcase
            ? "-mx-4 gap-0 px-[calc(50vw-38vw)] py-10 sm:px-[calc(50vw-170px)] sm:py-12 lg:px-[calc(50vw-190px)]"
            : "-mx-4 gap-4 px-4 py-4 sm:gap-5 lg:gap-6"
        }`}
      >
        {itemsToRender.map((item, index) => {
          const isActive = !loading && index === activeIndex;
          const key = loading ? `skeleton-${index}` : getKey(item as T);
          const distance = loading ? 2 : Math.abs(index - activeIndex);
          const clampedDistance = Math.min(distance, 2);
          const djTransform = isActive
            ? "translate3d(0,-10px,0) scale(1.1)"
            : distance === 1
              ? "translate3d(0,14px,0) scale(0.87)"
              : "translate3d(0,24px,0) scale(0.76)";
          const djOpacity = isActive ? 1 : distance === 1 ? 0.64 : 0.28;

          return (
            <div
              key={key}
              className={`shrink-0 snap-center ${widthClass} ${
                isDjShowcase
                  ? "-ml-8 first:ml-0 sm:-ml-14 lg:-ml-20"
                  : `transition-[opacity,transform] duration-300 ease-out ${
                      isActive ? "scale-100 opacity-100" : "scale-[0.96] opacity-75 hover:opacity-100"
                    }`
              }`}
              style={
                isDjShowcase
                  ? {
                      zIndex: 30 - clampedDistance * 10,
                      opacity: djOpacity,
                      transform: djTransform,
                      filter: isActive
                        ? "brightness(1.08) saturate(1.08)"
                        : `brightness(${distance === 1 ? 0.72 : 0.54}) saturate(0.85)`,
                      transition:
                        "transform 520ms cubic-bezier(0.22, 1, 0.36, 1), opacity 520ms cubic-bezier(0.22, 1, 0.36, 1), filter 520ms cubic-bezier(0.22, 1, 0.36, 1)",
                      willChange: "transform, opacity, filter",
                    }
                  : undefined
              }
            >
              {loading ? <CarouselSkeleton variant={variant} /> : renderItem(item as T, index, isActive)}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => scrollByPage(-1)}
        disabled={edgeState.left}
        className={`absolute left-1 top-1/2 z-40 hidden -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-[#171a20] p-3 text-gray-200 shadow-lg transition-all hover:-translate-y-1/2 hover:scale-105 hover:border-primary/35 hover:bg-[#1c2027] hover:text-white focus:outline-none focus:ring-2 focus:ring-primary/35 disabled:pointer-events-none disabled:opacity-30 lg:flex ${
          isDjShowcase ? "lg:left-6" : ""
        }`}
        aria-label="Назад"
      >
        <ChevronLeft className="h-5 w-5 shrink-0" />
      </button>

      <button
        type="button"
        onClick={() => scrollByPage(1)}
        disabled={edgeState.right || items.length <= 1}
        className={`absolute right-1 top-1/2 z-40 hidden -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-[#171a20] p-3 text-gray-200 shadow-lg transition-all hover:-translate-y-1/2 hover:scale-105 hover:border-primary/35 hover:bg-[#1c2027] hover:text-white focus:outline-none focus:ring-2 focus:ring-primary/35 disabled:pointer-events-none disabled:opacity-30 lg:flex ${
          isDjShowcase ? "lg:right-6" : ""
        }`}
        aria-label="Вперед"
      >
        <ChevronRight className="h-5 w-5 shrink-0" />
      </button>

      {isDjShowcase && !loading && items.length > 1 && (
        <div className="mt-1 flex items-center justify-center gap-1.5">
          {items.slice(0, 9).map((item, index) => (
            <button
              key={getKey(item)}
              type="button"
              onClick={() => {
                const node = scrollerRef.current;
                const target = node?.children[index] as HTMLElement | undefined;
                target?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
              }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                index === activeIndex
                  ? "w-7 bg-primary"
                  : "w-1.5 bg-white/20 hover:bg-white/45"
              }`}
              aria-label={`DJ ${index + 1}`}
            />
          ))}
          {items.length > 9 && (
            <span className="ml-1 text-[10px] font-medium text-muted-foreground">
              {activeIndex + 1}/{items.length}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

const CarouselSkeleton = ({ variant }: { variant: "dj" | "venue" }) => (
  <div className="premium-card aspect-[3/4] overflow-hidden">
    <div className="h-full w-full animate-pulse bg-[#171a20]">
      <div
        className={`h-full w-full ${
          variant === "dj"
            ? "bg-gradient-to-t from-[#0f1115] via-[#1c2027] to-[#252a33]"
            : "bg-[linear-gradient(135deg,#11141a,#1c2027_48%,#171a20)]"
        }`}
      />
    </div>
    <div className="absolute inset-x-0 bottom-0 space-y-3 p-5">
      <div className="h-4 w-2/3 rounded-full bg-white/10" />
      <div className="h-3 w-1/2 rounded-full bg-white/10" />
      <div className="flex gap-2">
        <div className="h-5 w-16 rounded-full bg-white/10" />
        <div className="h-5 w-20 rounded-full bg-white/10" />
      </div>
    </div>
  </div>
);

export default CatalogCarousel;
