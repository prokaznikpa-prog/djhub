import { memo } from "react";

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
}

const LazyImage = memo(({ src, alt, className = "" }: LazyImageProps) => (
  <img
    src={src}
    alt={alt}
    loading="lazy"
    decoding="async"
    className={className}
  />
));

LazyImage.displayName = "LazyImage";

export default LazyImage;
