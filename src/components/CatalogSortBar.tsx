import { memo } from "react";

export type CatalogSortKey = "match" | "price" | "popular" | "newest";

const SORT_OPTIONS: Array<{ value: CatalogSortKey; label: string }> = [
  { value: "match", label: "Лучшее совпадение" },
  { value: "price", label: "Лучшая цена" },
  { value: "popular", label: "Популярные" },
  { value: "newest", label: "Новые" },
];

interface CatalogSortBarProps {
  value: CatalogSortKey;
  onChange: (value: CatalogSortKey) => void;
  hidePrice?: boolean;
}

const CatalogSortBar = ({ value, onChange, hidePrice = false }: CatalogSortBarProps) => (
  <div className="overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    <div className="inline-flex min-w-max items-center gap-2">
      {SORT_OPTIONS.filter((option) => !hidePrice || option.value !== "price").map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200 ease-out ${
            value === option.value
              ? "bg-primary text-primary-foreground shadow-[0_8px_20px_rgba(239,68,68,0.22)]"
              : "border border-white/10 bg-[var(--surface-deep)] text-muted-foreground hover:border-primary/25 hover:bg-[var(--surface-hover)] hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

export default memo(CatalogSortBar);
