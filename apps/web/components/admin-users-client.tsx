"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminUserRow } from "@/lib/admin-users";
import type { SubscriptionTier } from "@/lib/database.types";
import { formatDate } from "@/lib/format";

type ComposeState = {
  open: boolean;
  userIds: string[];
};

export function AdminUsersClient() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [compose, setCompose] = useState<ComposeState>({
    open: false,
    userIds: [],
  });
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      const json = (await res.json()) as {
        users?: AdminUserRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "failed to load users");
      setUsers(json.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const email = (u.email ?? "").toLowerCase();
      const name = (u.display_name ?? "").toLowerCase();
      return email.includes(q) || name.includes(q);
    });
  }, [users, search]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectGroup(kind: "all" | "pro" | "free" | "clear") {
    if (kind === "clear") {
      setSelected(new Set());
      return;
    }
    const ids = filtered
      .filter((u) => {
        if (kind === "all") return true;
        if (kind === "pro") return u.subscription_tier === "pro";
        return u.subscription_tier === "free";
      })
      .map((u) => u.id);
    setSelected(new Set(ids));
  }

  async function setTier(userIds: string[], tier: SubscriptionTier) {
    if (userIds.length === 0) {
      setError("Select at least one user");
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/admin/users/tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds, tier }),
      });
      const json = (await res.json()) as {
        error?: string;
        updated?: number;
      };
      if (!res.ok) throw new Error(json.error ?? "tier update failed");
      setNote(
        `Updated ${json.updated ?? userIds.length} user(s) to ${tier}.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendEmail() {
    const userIds = compose.userIds;
    if (userIds.length === 0) {
      setError("No recipients");
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/admin/users/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds,
          subject,
          body,
        }),
      });
      const raw = await res.text();
      let json: {
        error?: string;
        sent?: number;
        failed?: number;
        details?: {
          failed?: Array<{ email: string; error: string }>;
        };
      } = {};
      if (raw.trim()) {
        try {
          json = JSON.parse(raw) as typeof json;
        } catch {
          throw new Error(
            raw.slice(0, 280).trim() || `HTTP ${res.status} (non-JSON)`,
          );
        }
      }
      if (!res.ok) {
        throw new Error(json.error ?? `send failed (HTTP ${res.status})`);
      }
      const failHint =
        json.details?.failed?.length ?
          ` · ${json.details.failed
            .slice(0, 3)
            .map((f) => `${f.email}: ${f.error}`)
            .join("; ")}`
        : "";
      setNote(
        `Sent ${json.sent ?? 0}` +
          (json.failed ? ` · ${json.failed} failed${failHint}` : ""),
      );
      if ((json.failed ?? 0) === 0) {
        setCompose({ open: false, userIds: [] });
        setSubject("");
        setBody("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const selectedCount = selected.size;
  const selectedList = [...selected];

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Admin</h1>
        <p className="text-textMuted text-sm mt-1">
          Manage Pro tiers and email users via Resend.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email or name"
          className="h-10 min-w-[200px] flex-1 rounded-xl border border-border bg-surface px-3 text-sm text-text"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => selectGroup("all")}
        >
          Select all
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => selectGroup("pro")}
        >
          Select Pro
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => selectGroup("free")}
        >
          Select Free
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => selectGroup("clear")}
        >
          Clear
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-textMuted text-xs">
          {selectedCount} selected · {filtered.length} shown
        </span>
        <Button
          type="button"
          size="sm"
          loading={busy}
          disabled={selectedCount === 0}
          onClick={() => void setTier(selectedList, "pro")}
        >
          Grant Pro
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={busy}
          disabled={selectedCount === 0}
          onClick={() => void setTier(selectedList, "free")}
        >
          Revoke Pro
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={selectedCount === 0}
          onClick={() =>
            setCompose({ open: true, userIds: selectedList })
          }
        >
          Email selected
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void load()}
        >
          Refresh
        </Button>
      </div>

      {error ? (
        <p className="text-danger text-sm">{error}</p>
      ) : null}
      {note ? (
        <p className="text-success text-sm">{note}</p>
      ) : null}

      {compose.open ? (
        <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
          <p className="text-text text-sm font-semibold">
            Compose email · {compose.userIds.length} recipient
            {compose.userIds.length === 1 ? "" : "s"}
          </p>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm text-text"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message body (plain text; blank lines become paragraphs)"
            rows={6}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              loading={busy}
              onClick={() => void sendEmail()}
            >
              Send
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCompose({ open: false, userIds: [] })}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-textMuted text-sm">Loading users…</p>
      ) : filtered.length === 0 ? (
        <p className="text-textMuted text-sm">No users match.</p>
      ) : (
        <div className="overflow-x-auto border border-border rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surfaceAlt text-left text-textMuted text-xs">
                <th className="p-3 w-10" />
                <th className="p-3 font-semibold">Email</th>
                <th className="p-3 font-semibold">Name</th>
                <th className="p-3 font-semibold">Tier</th>
                <th className="p-3 font-semibold">Joined</th>
                <th className="p-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const isPro = u.subscription_tier === "pro";
                return (
                  <tr
                    key={u.id}
                    className="border-b border-border last:border-0 hover:bg-surface/60"
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selected.has(u.id)}
                        onChange={() => toggleOne(u.id)}
                        aria-label={`Select ${u.email ?? u.id}`}
                      />
                    </td>
                    <td className="p-3 text-text">{u.email ?? "—"}</td>
                    <td className="p-3 text-textMuted">
                      {u.display_name ?? "—"}
                    </td>
                    <td className="p-3">
                      <Badge variant={isPro ? "primary" : "muted"}>
                        {u.subscription_tier.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="p-3 text-textMuted whitespace-nowrap">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                        {isPro ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void setTier([u.id], "free")}
                          >
                            Revoke
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            onClick={() => void setTier([u.id], "pro")}
                          >
                            Grant Pro
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setCompose({ open: true, userIds: [u.id] })
                          }
                        >
                          Email
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
