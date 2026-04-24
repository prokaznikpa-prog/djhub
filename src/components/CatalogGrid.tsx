import { memo, type ReactNode } from "react";

interface CatalogGridProps<T> {
  items: T[];
  loading?: boolean;
  getKey: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  emptyState?: ReactNode;
}

const SKELETON_COUNT = 10;

const CatalogGrid = <T,>({
  items,
  loading = false,
  getKey,
  renderItem,
  emptyState,
}: CatalogGridProps<T>) => {
  if (loading) {
    return (
      <div className="grid w-full grid-cols-2 gap-4 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
          <div
            key={index}
            className="h-[312px] w-full min-w-0 max-w-[206px] justify-self-center overflow-hidden rounded-2xl border border-white/5 bg-[var(--surface-solid)] shadow-[0_14px_30px_rgba(0,0,0,0.28)]"
          >
            <div className="h-[164px] animate-pulse bg-[var(--surface-hover)]" />
            <div className="space-y-3 p-3">
              <div className="h-4 w-3/4 animate-pulse rounded-full bg-white/10" />
              <div className="h-3 w-1/2 animate-pulse rounded-full bg-white/10" />
              <div className="h-8 w-24 animate-pulse rounded-lg bg-white/10" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) return <>{emptyState}</>;

  return (
    <div className="grid w-full grid-cols-2 gap-4 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((item, index) => (
        <div key={getKey(item)} className="w-full min-w-0 max-w-[206px] justify-self-center">
          {renderItem(item, index)}
        </div>
      ))}
    </div>
  );
};

export default memo(CatalogGrid) as typeof CatalogGrid;
