"use client";

/**
 * Shared “include estimate in scenario” control used by Catch the catch,
 * STR comps, and LTR rent estimate. Pair with a muted Refresh text link
 * in the panel footer — not a primary Apply button.
 */
export function ScenarioIncludeToggle({
  label,
  description,
  included,
  onToggle,
  ariaLabelOn,
  ariaLabelOff,
}: {
  label: string;
  description: string;
  included: boolean;
  onToggle: () => void;
  ariaLabelOn: string;
  ariaLabelOff: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 bg-surface border border-border rounded-xl px-3 py-2">
      <div className="min-w-0">
        <p className="text-text text-xs font-semibold">{label}</p>
        <p className="text-textMuted text-[11px] leading-4">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={included}
        aria-label={included ? ariaLabelOn : ariaLabelOff}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          included ? "bg-primary" : "bg-border"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
            included ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

/** Muted text-link used for paid/free refresh actions under estimate panels. */
export function ScenarioRefreshLink({
  loading,
  onClick,
  label = "Refresh",
  loadingLabel = "Refreshing…",
  title,
}: {
  loading: boolean;
  onClick: () => void;
  label?: string;
  loadingLabel?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="text-xs text-textMuted hover:underline disabled:opacity-50 shrink-0"
      disabled={loading}
      onClick={onClick}
      title={title}
    >
      {loading ? loadingLabel : label}
    </button>
  );
}
