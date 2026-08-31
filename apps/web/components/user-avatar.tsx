"use client";

import { PapucMark } from "@/components/papuc-mark";
import { cn } from "@/lib/utils";

const SIZE = {
  xs: "h-6 w-6",
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-14 w-14",
  xl: "h-20 w-20",
} as const;

const MARK = {
  xs: "h-3.5 w-3.5",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-7 w-7",
  xl: "h-9 w-9",
} as const;

export function UserAvatar({
  url,
  name,
  size = "sm",
  className,
}: {
  url?: string | null;
  name?: string | null;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const label = (name ?? "Papuc investor").trim() || "Papuc investor";

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={label}
        className={cn(
          SIZE[size],
          "shrink-0 rounded-full object-cover border border-border/60 bg-surfaceAlt",
          className,
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        SIZE[size],
        "inline-flex shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary border border-primary/25",
        className,
      )}
      aria-label={label}
      title={label}
    >
      <PapucMark className={MARK[size]} title="" />
    </span>
  );
}
