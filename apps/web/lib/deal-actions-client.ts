/**
 * Browser helpers for /api/deals/[id]/action — shared by Discover and
 * the project deals grid.
 */

export async function postDealAction(
  dealId: string,
  projectId: string,
  action: "saved" | "dismissed",
): Promise<void> {
  const res = await fetch(`/api/deals/${dealId}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, projectId }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error || `action failed (${res.status})`);
  }
}

export async function deleteDealAction(
  dealId: string,
  action: "saved" | "dismissed",
): Promise<void> {
  const res = await fetch(
    `/api/deals/${dealId}/action?action=${encodeURIComponent(action)}`,
    { method: "DELETE" },
  );
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error || `undo failed (${res.status})`);
  }
}
