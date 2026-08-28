/** Readable message from Error, PostgrestError, or plain `{ message }` objects. */
export function errorMessage(err: unknown): string {
  if (err == null) return "Unknown error";
  if (typeof err === "string") return err || "Unknown error";
  if (err instanceof Error) {
    return err.message || err.name || "Error";
  }
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.trim()) {
      const code = typeof o.code === "string" ? ` (${o.code})` : "";
      const details =
        typeof o.details === "string" && o.details.trim()
          ? `: ${o.details}`
          : "";
      return `${o.message}${code}${details}`;
    }
    if (typeof o.error === "string" && o.error.trim()) return o.error;
    if (o.error && typeof o.error === "object") {
      return errorMessage(o.error);
    }
    try {
      return JSON.stringify(err);
    } catch {
      /* fall through */
    }
  }
  return String(err);
}
