"use client";

import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type PhotoAnalysisBadge = {
  label: string;
  tone?: "critical" | "major" | "minor" | "cosmetic" | "neutral";
  onClick: () => void;
};

const ANALYSIS_BADGE_TONE: Record<
  NonNullable<PhotoAnalysisBadge["tone"]>,
  string
> = {
  critical: "bg-danger text-white hover:bg-danger/90",
  major: "bg-warning text-black hover:bg-warning/90",
  minor: "bg-primary text-white hover:bg-primary/90",
  cosmetic: "bg-black/70 text-white hover:bg-black/85",
  neutral: "bg-black/70 text-white hover:bg-black/85",
};

export function PhotoCarousel({
  photos,
  className,
  index,
  onIndexChange,
  analysisBadge,
}: {
  photos: string[];
  className?: string;
  /** Controlled 0-based slide index (e.g. from a rehab finding tap). */
  index?: number;
  onIndexChange?: (index: number) => void;
  /**
   * When photo-condition analysis has results: badge that jumps to the
   * matching finding in the Photo condition analysis panel.
   */
  analysisBadge?: PhotoAnalysisBadge | null;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      const i = emblaApi.selectedScrollSnap();
      setSelectedIndex(i);
      onIndexChange?.(i);
    };
    emblaApi.on("select", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onIndexChange]);

  // External jump (rehab finding tap) — only scroll when the requested
  // index differs from the current snap so we don't fight user swipes.
  useEffect(() => {
    if (!emblaApi || index === undefined) return;
    if (index < 0 || index >= photos.length) return;
    if (emblaApi.selectedScrollSnap() === index) return;
    emblaApi.scrollTo(index);
  }, [emblaApi, index, photos.length]);

  if (!photos.length) {
    return (
      <div
        className={cn(
          "rounded-2xl bg-surfaceAlt border border-border h-64 flex items-center justify-center",
          className,
        )}
      >
        <p className="text-textMuted text-xs">No photos</p>
      </div>
    );
  }

  return (
    <div id="deal-photos" className={cn("relative", className)}>
      <div ref={emblaRef} className="overflow-hidden rounded-2xl">
        <div className="flex">
          {photos.map((url, i) => (
            <div
              key={`${i}:${url}`}
              className="relative flex-[0_0_100%] aspect-[16/10] bg-surfaceAlt"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                loading={i === 0 ? "eager" : "lazy"}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      </div>
      {photos.length > 1 ? (
        <>
          <button
            type="button"
            onClick={scrollPrev}
            className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/60 text-white rounded-full p-2 hover:bg-black/80 transition-colors"
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={scrollNext}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/60 text-white rounded-full p-2 hover:bg-black/80 transition-colors"
            aria-label="Next photo"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute right-3 bottom-3 bg-black/60 rounded-full px-2 py-1">
            <span className="text-white text-xs">
              {selectedIndex + 1}/{photos.length}
            </span>
          </div>
        </>
      ) : null}
      {analysisBadge ? (
        <button
          type="button"
          onClick={analysisBadge.onClick}
          className={cn(
            "absolute left-3 bottom-3 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm transition-colors",
            ANALYSIS_BADGE_TONE[analysisBadge.tone ?? "neutral"],
          )}
          title="Jump to photo condition analysis"
          aria-label={`${analysisBadge.label}. Jump to photo condition analysis`}
        >
          {analysisBadge.label}
        </button>
      ) : null}
    </div>
  );
}
