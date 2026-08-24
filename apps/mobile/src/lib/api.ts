import { supabase } from "./supabase";

/** Base URL for Vercel Next.js API routes (no trailing slash). */
export function apiBaseUrl(): string {
  const raw =
    process.env.EXPO_PUBLIC_API_URL?.trim() ||
    process.env.EXPO_PUBLIC_WEB_ORIGIN?.trim() ||
    "";
  return raw.replace(/\/$/, "");
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const base = apiBaseUrl();
  if (!base) {
    throw new ApiError(
      "EXPO_PUBLIC_API_URL is not set (point at your Vercel app origin)",
      0,
    );
  }
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = {
    ...(await authHeaders()),
    ...(init?.headers as Record<string, string> | undefined),
  };
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      body &&
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}
