import { cn } from "@/lib/utils";

/** Outline house-slipper mark — inherits `currentColor`. */
export function PapucMark({
  className,
  title = "Papuc",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      className={cn("shrink-0", className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <g
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 44c0 2.8 4.2 5 14 5h19c6.5 0 11-1.9 11-4.8 0-1.6-1-3-2.8-3.8L40.5 35" />
        <path d="M13 42.5C12.5 34 16.5 26 24 21.5c5.2-3.1 11.2-3.4 16.2-.8 4.2 2.2 7.2 6.4 8.2 11.2.6 2.8.3 5.5-.8 7.8" />
        <path d="M40 34.5c1.4-3.8.4-8.2-3.4-10.6" />
        <path d="M25 27c-2.4-2-5.2-1.8-6.4.6 1.7.3 3.7 1.4 4.8 3.2" />
        <path d="M28.5 27c2.4-2 5.2-1.8 6.4.6-1.7.3-3.7 1.4-4.8 3.2" />
        <circle cx="26.8" cy="27.8" r="1.6" />
      </g>
    </svg>
  );
}
