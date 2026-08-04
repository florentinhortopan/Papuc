"use client";

import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const ZOOM_STEP = 0.5;

export function PhotoLightbox({
  photos,
  index,
  open,
  onOpenChange,
  onIndexChange,
}: {
  photos: string[];
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
}) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const resetView = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
    dragRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    resetView();
  }, [open, index, resetView]);

  const goPrev = useCallback(() => {
    if (photos.length < 2) return;
    onIndexChange(Math.max(0, index - 1));
  }, [index, onIndexChange, photos.length]);

  const goNext = useCallback(() => {
    if (photos.length < 2) return;
    onIndexChange(Math.min(photos.length - 1, index + 1));
  }, [index, onIndexChange, photos.length]);

  const zoomBy = useCallback((delta: number) => {
    setScale((prev) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta));
      return next;
    });
  }, []);

  useEffect(() => {
    if (scale <= MIN_SCALE) setPan({ x: 0, y: 0 });
  }, [scale]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomBy(ZOOM_STEP);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomBy(-ZOOM_STEP);
      } else if (e.key === "0") {
        e.preventDefault();
        resetView();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, goPrev, goNext, zoomBy, resetView]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (scale <= MIN_SCALE) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pan.x,
      originY: pan.y,
      moved: false,
    };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
    setPan({
      x: drag.originX + dx,
      y: drag.originY + dy,
    });
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === e.pointerId) {
      if (dragRef.current.moved) suppressClickRef.current = true;
      dragRef.current = null;
    }
  }

  function onWheel(e: ReactWheelEvent<HTMLDivElement>) {
    // Trackpads / mice: zoom toward cursor without scrolling the page.
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? ZOOM_STEP / 2 : -ZOOM_STEP / 2);
  }

  function onImageClick() {
    // Toggle a comfortable zoom; ignore if the user was dragging.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (scale > MIN_SCALE) {
      resetView();
    } else {
      setScale(2);
    }
  }

  const url = photos[index];
  if (!url) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "left-0 top-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0",
          "rounded-none border-0 bg-black/95 p-0 shadow-none",
          "data-[state=open]:animate-fade-in",
          "[&>button]:right-3 [&>button]:top-3 [&>button]:z-20",
          "[&>button]:rounded-full [&>button]:bg-white/10 [&>button]:p-2",
          "[&>button]:text-white [&>button]:hover:bg-white/20 [&>button]:hover:text-white",
        )}
        onOpenAutoFocus={(e) => {
          // Keep focus on the stage so arrow keys work immediately.
          e.preventDefault();
          stageRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">Photo gallery</DialogTitle>
        <DialogDescription className="sr-only">
          Expanded photo {index + 1} of {photos.length}. Use arrow keys to
          change photos, plus and minus to zoom.
        </DialogDescription>

        <div
          ref={stageRef}
          tabIndex={-1}
          className="relative flex h-full w-full items-center justify-center outline-none"
          onWheel={onWheel}
        >
          <div
            className={cn(
              "relative flex h-full w-full items-center justify-center overflow-hidden",
              scale > MIN_SCALE ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              draggable={false}
              onClick={onImageClick}
              className="max-h-[min(92dvh,100%)] max-w-[min(96vw,100%)] select-none object-contain transition-transform duration-150"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              }}
            />
          </div>

          {photos.length > 1 ? (
            <>
              <button
                type="button"
                onClick={goPrev}
                disabled={index <= 0}
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20 disabled:pointer-events-none disabled:opacity-30"
                aria-label="Previous photo"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={index >= photos.length - 1}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20 disabled:pointer-events-none disabled:opacity-30"
                aria-label="Next photo"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          ) : null}

          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
            <button
              type="button"
              onClick={() => zoomBy(-ZOOM_STEP)}
              disabled={scale <= MIN_SCALE}
              className="rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 disabled:opacity-30"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="min-w-[4.5rem] rounded-full bg-white/10 px-3 py-1.5 text-center text-xs font-medium text-white tabular-nums">
              {index + 1}/{photos.length}
              {scale > MIN_SCALE ? ` · ${Math.round(scale * 100)}%` : ""}
            </span>
            <button
              type="button"
              onClick={() => zoomBy(ZOOM_STEP)}
              disabled={scale >= MAX_SCALE}
              className="rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 disabled:opacity-30"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>

          <p className="pointer-events-none absolute left-3 top-3 z-10 hidden text-[11px] text-white/60 sm:block">
            ← → photos · + − zoom · Esc close
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
