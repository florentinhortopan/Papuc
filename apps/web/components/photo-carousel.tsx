"use client";

import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, Expand } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { PhotoLightbox } from "@/components/photo-lightbox";
import { cn } from "@/lib/utils";

/** Ignore clicks that follow a carousel swipe (Embla v8 has no clickAllowed). */
const DRAG_CLICK_THRESHOLD_PX = 8;

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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const openLightbox = useCallback(() => setLightboxOpen(true), []);

  const onSlidePointerDown = useCallback((e: ReactPointerEvent) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    draggedRef.current = false;
  }, []);

  const onSlidePointerMove = useCallback((e: ReactPointerEvent) => {
    const start = pointerStartRef.current;
    if (!start || draggedRef.current) return;
    if (
      Math.abs(e.clientX - start.x) > DRAG_CLICK_THRESHOLD_PX ||
      Math.abs(e.clientY - start.y) > DRAG_CLICK_THRESHOLD_PX
    ) {
      draggedRef.current = true;
    }
  }, []);

  const onSlideClick = useCallback(() => {
    if (draggedRef.current) return;
    openLightbox();
  }, [openLightbox]);

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
                onPointerDown={onSlidePointerDown}
                onPointerMove={onSlidePointerMove}
                onClick={onSlideClick}
                className="w-full h-full object-cover cursor-pointer"
              />
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={openLightbox}
        className="absolute right-3 top-3 z-[1] bg-black/60 text-white rounded-full p-2 hover:bg-black/80 transition-colors"
        aria-label="Expand photo"
        title="Expand"
      >
        <Expand className="h-4 w-4" />
      </button>
      {photos.length > 1 ? (
        <>
          <button
            type="button"
            onClick={scrollPrev}
            className="absolute left-3 top-1/2 z-[1] -translate-y-1/2 bg-black/60 text-white rounded-full p-2 hover:bg-black/80 transition-colors"
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={scrollNext}
            className="absolute right-3 top-1/2 z-[1] -translate-y-1/2 bg-black/60 text-white rounded-full p-2 hover:bg-black/80 transition-colors"
            aria-label="Next photo"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute right-3 bottom-3 z-[1] bg-black/60 rounded-full px-2 py-1">
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
            "absolute left-3 bottom-3 z-[1] rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm transition-colors",
            ANALYSIS_BADGE_TONE[analysisBadge.tone ?? "neutral"],
          )}
          title="Jump to Catch the catch"
          aria-label={`${analysisBadge.label}. Jump to Catch the catch`}
        >
          {analysisBadge.label}
        </button>
      ) : null}
      <PhotoLightbox
        photos={photos}
        index={selectedIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={(i) => {
          setSelectedIndex(i);
          onIndexChange?.(i);
          emblaApi?.scrollTo(i);
        }}
      />
    </div>
  );
}
