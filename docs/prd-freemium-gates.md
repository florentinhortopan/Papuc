# PRD: Papuc Freemium Gates (Stage 1 Monetization)

**Status:** Draft — ready to implement  
**Product:** Papuc (DSCR Deal Scout)  
**Date:** 2026-08-28  
**Owner:** Flo  
**Related:** `profiles.subscription_tier`, `UpgradeDialog`, social v1 (`user_follows`, `project_watches`, `project_members` Phase 3 prep); legal/data framing in [`plan-legal-docs-and-listing-compliance.md`](./plan-legal-docs-and-listing-compliance.md)

---

## 1. Problem

Papuc has real variable costs (MLS/HasData, AirROI, Claude, nightly cron) and a sketched Free/Pro enum, but almost no enforced gates. We need to monetize Stage 1 ASAP without killing product-led growth (share links, public projects, home feed).

Stage 2 (capital / co-invest take-rate) is out of scope for this PRD, but gates must leave a clean path to it.

---

## 2. Goals

1. **Charge for automation + costly tools**, not for discovery.
2. **Invert social gating:** public browse stays Free; friend / collaborative investing is Pro.
3. **Cap Free project count** so cron and API spend stay bounded.
4. Ship **enforceable server-side gates** (not UI-only) with a clear Upgrade dialog path.
5. Keep Stripe checkout as a follow-up if needed; gates must work with existing admin `grant-pro` / `subscription_tier`.
6. Make **owned projects manageable at scale**: filter by visibility (public vs private / social), multi-select, and safe bulk actions — especially once Pro users approach 20 projects.

### Non-goals (this PRD)

- Stripe / RevenueCat checkout UX (placeholder CTA OK until wired).
- Securities-compliant syndication / capital raise (Stage 2).
- Metered credit wallet UI (optional later; hard caps first).
- Changing share-link viral loop (stays Free → signup).
- Bulk actions across *other people's* public projects (owner-scoped only).

---

## 3. Strategy (from planning)

**Cloudflare-style freemium:** free tier creates habit and network density; Pro unlocks when usage burns margin or saves serious time.

| Layer | Free | Pro |
|---|---|---|
| Own underwriting | Yes (manual) | Yes + automation |
| Public discovery | Yes | Yes |
| Friend / collab investing | No (upgrade) | Yes |
| Project volume | Tight cap | Generous cap |
| Expensive APIs | Limited / off | Included or higher caps |

**Do not** gate “see public projects” behind Pro — empty-network tax and kills Stage 2 density.  
**Do** gate actions that imply private collaboration or shared work with friends.

---

## 4. Tier matrix

### 4.1 Projects (volume)

| Limit | Free | Pro |
|---|---|---|
| Max **owned** projects (any status) | **2** | **20** |
| Behavior at cap | Block create; show Upgrade (Free) or “Archive a project” (Pro) | Soft ceiling for cost control |

**Notes**

- Count all owned rows in `projects` (active + paused). Archiving = soft-delete or `status = archived` that **does not** count toward the cap (implementation choice; prefer `archived_at` so Pro can rotate markets without deleting history).
- “Scout like this” / import that creates a new project **counts** toward the cap.
- Nightly scout only runs for Pro (existing intent); Free never gets background scout even if under project cap.

**Rationale for Pro = 20:** enough for multi-metro / multi-strategy hunters; bounds cron fan-out. Market Pro as “up to 20 active markets,” not as the hero benefit — hero benefits are automation + social investing.

### 4.2 Public social (Free — growth)

Available to **all signed-in users** (Free and Pro):

- Browse public projects and deals (`is_public = true`)
- Home feed tabs that are public discovery (For You / Explore / etc.)
- View public investor profiles (`/u/[id]`)
- Follow users (`user_follows`) — asymmetric, public-graph
- Watch public projects (`project_watches`) — engagement without edit rights
- Share deal/project links (`/share/[token]`) — no login for hook; sign-in for full underwriting
- Make **own** project public / private (toggle `is_public`)

Public visibility is the free CDN: density first, monetize later.

### 4.3 Social investing with friends (Pro)

**Definition for Stage 1 gates:** anything that turns “I browse strangers’ public work” into “I work / invest privately with people I know.”

| Capability | Free | Pro |
|---|---|---|
| Friends feed (deals from followed users ∪ watched projects) | Read-only tease **or** full read OK* | Full |
| Invite friend to a **private** project | ❌ | ✅ |
| `project_members` join (member/viewer on private or public) | ❌ | ✅ |
| Co-scout / deal actions on a project you don’t own | ❌ | ✅ (Phase 3 member role) |
| Private shared watchlist / private group project | ❌ | ✅ |
| Future: co-invest / capital commit UI | ❌ | ✅ (Stage 2; separate PRD) |

\*Product choice (pick one in implementation):

- **Preferred for growth:** Free can use Friends feed (follows/watches already Free). Pro unlocks **collaboration** (members, invites, private shared projects), not the feed itself.
- **Alternate:** Friends feed itself is Pro — only if we need a sharper paywall; weaker for network effects.

**Decision for this PRD:** Prefer growth — **Friends feed stays Free**; **Pro = invite / members / private collab / co-scout**. Upgrade copy should say “Invest and scout with friends,” not “See friends’ deals.”

### 4.4 Automation & tools (existing Pro intent — enforce)

| Capability | Free | Pro |
|---|---|---|
| Manual scout | ✅ (rate-limited) | ✅ (higher limits) |
| Nightly background scout | ❌ | ✅ (respect per-project + account pause prefs) |
| Email digests / deal alerts | ❌ | ✅ |
| Catch the catch (condition / rehab) | ❌ or 1 free trial | ✅ |
| Financing fit / lender match flows marked Pro | ❌ | ✅ |
| Compare 3+ deals | ❌ (max 2) | ✅ |
| CSV / PDF export | ❌ | ✅ |
| Priority MLS / expensive STR (AirROI) | Hard cap or paywall | Included pool |

Settings already soft-gates nightly pause + digests behind Pro UI; this PRD requires **API/cron enforcement**.

---

## 5. User stories

1. **As a Free user**, I can create up to 2 projects, underwrite manually, publish a project as public, and browse/follow/watch others so I get value before paying.
2. **As a Free user**, when I hit a 3rd project or try to invite a friend into a private project, I see Papuc Pro with a clear reason.
3. **As a Pro user**, I can run up to 20 projects with nightly scout and alerts, and invite friends as members to scout/act together.
4. **As any owner**, I can filter my project list by **Public** vs **Private** (and All / Archived) so social-facing work is separated from personal underwriting.
5. **As any owner**, I can multi-select projects and run bulk ops (e.g. make public, make private, archive, toggle nightly) without opening each project.
6. **As Papuc**, cron and MLS spend only fan out to Pro projects within caps.

---

## 6. UX requirements

### Upgrade dialog

Update `UpgradeDialog` feature bullets to match this matrix:

- Up to 20 projects + nightly background scout
- Email alerts for high-score deals
- Invest & scout with friends (invites / shared private projects)
- Catch the catch, compare 3+, CSV export, priority data limits

Pass a `reason` code for analytics, e.g. `project_limit`, `invite_friend`, `nightly_scout`, `export_csv`.

### Soft vs hard block

- **Hard block** (server returns 402/403 + client Upgrade): create project over cap, invite member, enable nightly, export, Pro-only APIs.
- **Soft tease:** lock icon on Pro controls; Free can still browse public.

### Grandfathering

- Existing Free users with **>2** projects: allow keep; block **new** creates until ≤2 or upgrade. Do not auto-delete.
- Existing Free users who somehow have Pro prefs on: cron must no-op unless `subscription_tier = pro`.

### 6.1 Projects list — visibility filters

Today `/projects` is a flat grid with no filters (`ProjectsPageClient`). With Free/Pro caps and public vs private social investing, owners need a clear split.

**Filter control** (segmented control or chips above the grid):

| Filter | Shows |
|---|---|
| **All** (default) | Non-archived owned projects |
| **Public** | `is_public = true` — discoverable / social surface |
| **Private** | `is_public = false` — personal or friend-collab underwriting |
| **Archived** | `archived_at IS NOT NULL` (hidden from cap; optional tab) |

**Optional secondary chips (Pro-oriented, can ship later):**

- Nightly on / off
- Has members (friend collab) vs solo

**Copy / affordances**

- Each card already (or should) show a Public / Private badge so the filter result is scannable.
- Empty states per filter: e.g. Public empty → “Make a project public to appear on the feed.”
- URL sync optional but useful: `?visibility=public|private|all|archived` for shareable list state.
- Filters apply to **owned** projects only on `/projects` (not the home feed of others’ public work).

### 6.2 Projects list — multi-select + bulk operations

**Selection**

- Enter **Select** mode (toolbar button) or always-visible checkboxes on cards when ≥1 project.
- Click/tap checkbox selects; “Select all” applies to **currently filtered** list (not hidden filters).
- Sticky bulk action bar when `selectedCount > 0`: “N selected” + actions + Clear.

**Bulk actions (v1)**

| Action | Who | Notes |
|---|---|---|
| **Make public** | Free + Pro | Sets `is_public = true`; confirm if >1 (“These will appear on the Papuc feed”). |
| **Make private** | Free + Pro | Sets `is_public = false`; warn if watchers/members will lose public discovery (members keep access if Phase C). |
| **Archive** | Free + Pro | Sets `archived_at`; frees cap slots; undo via Archived filter → Restore. |
| **Restore** | Free + Pro | Clears `archived_at`; **must re-check project cap** — if restore would exceed tier max, block + Upgrade / archive something else. |
| **Enable nightly scout** | Pro only | Per-project `nightly_scout_enabled = true`; Free → Upgrade `nightly_scout`. |
| **Pause nightly scout** | Pro only | Set false on selection. |
| **Delete** | Free + Pro | Destructive; confirm; optional v1.5 if Archive covers rotation. |

**Out of scope for bulk v1**

- Bulk invite members (do per-project; easy to mis-invite).
- Bulk export / compare (deal-level tools, not project list).
- Cross-user bulk (never).

**Safety**

- All bulk mutations are **owner-only**, server-validated (`owner_id = auth.uid()`), batched in one API (`PATCH /api/projects/bulk` or server action) with per-id results.
- Partial failure: report “12 updated, 2 failed” rather than silent skip.
- Bulk Make public does **not** bypass any future abuse limits; same as single toggle.
- Selecting Private projects + “Invite friends” is **not** a bulk action — deep-link to first selected project’s invite sheet (Pro) if we add a shortcut later.

**Tier interaction**

- Filters + select UX are **Free** (even with 2 projects — teaches the public/private mental model early).
- Bulk nightly actions respect Pro entitlements.
- Cap counting ignores archived; bulk archive is the primary escape hatch at Pro = 20.

---

## 7. Technical requirements

### 7.1 Shared entitlement module

Add something like `@papuc/core` or `apps/web/lib/entitlements.ts`:

```ts
export const TIER_LIMITS = {
  free: { maxProjects: 2, maxCompare: 2, nightlyScout: false, friendCollab: false },
  pro:  { maxProjects: 20, maxCompare: 99, nightlyScout: true, friendCollab: true },
} as const;
```

Helpers: `assertCanCreateProject(tier, ownedCount)`, `assertCanInviteMember(tier)`, `assertNightlyScout(tier)`, etc.

### 7.2 Enforcement points (must all check tier)

| Surface | Gate |
|---|---|
| `createProject` (web + mobile + scout-like-this + import) | Project cap |
| Bulk restore / un-archive | Project cap (same as create) |
| Bulk enable nightly | Pro only |
| Nightly cron | Skip non-Pro owners; skip over-cap projects by policy |
| Email digest job | Pro only |
| Condition / AirROI / export / compare APIs | Per matrix |
| `project_members` insert + invite API (when built) | `friendCollab` Pro |
| Optional: RLS helper later | App-layer checks first; RLS for members when Phase 3 ships |

### 7.3 Schema (minimal for this PRD)

- Reuse `profiles.subscription_tier` (`free` \| `pro`).
- Prefer `projects.archived_at timestamptz null` so archived projects don’t count toward caps (migration). Index `(owner_id)` + partial where `archived_at is null` for cap counts.
- No new tier enum values yet.
- `project_members` already exists (soft prep) — wire invite UI only behind Pro.
- Bulk API: accept `{ ids: uuid[], action: 'make_public' | 'make_private' | 'archive' | 'restore' | 'nightly_on' | 'nightly_off' }`, return `{ ok: uuid[], failed: { id, error }[] }`.

### 7.5 Projects list client (web)

- Extend `ProjectsPageClient` with filter state + selection state (client-side filter of loaded owned list is fine for ≤20; no pagination required until higher caps).
- Card component: checkbox in select mode; Public/Private badge always visible.
- Bulk bar: sticky bottom or top under page header on mobile/desktop.

### 7.4 Billing

- Short term: admin grant Pro (`/admin`, `grant-pro` cron) remains source of truth.
- Follow-up ticket: Stripe Checkout + webhook → set `subscription_tier` / `subscription_renews_at`.
- Upgrade CTA: enable when Stripe ready; until then keep “Coming soon” **or** waitlist mailto — product call at implement time.

---

## 8. Rollout plan

### Phase A — Enforce what exists (1–2 days)

1. Entitlements module + project create cap (2 / 20).
2. Cron + digests: Pro-only.
3. Update UpgradeDialog copy; wire `reason` on project create + settings.
4. Grandfather >2 Free projects (no new creates).
5. Migration: `archived_at` (needed for cap escape + list filters).

### Phase A2 — Projects list management (1–2 days; can parallelize with A)

1. Visibility filter chips: All / Public / Private / Archived.
2. Multi-select + bulk bar: make public/private, archive, restore (cap check).
3. Bulk nightly on/off (Pro-gated).
4. Public/Private badge on project cards if missing.

### Phase B — Tool gates (2–3 days)

1. Enforce condition, compare 3+, CSV export, AirROI behind Pro (or Free trial once).
2. Settings Pro toggles already present — align server.

### Phase C — Friend collab Pro (3–5 days)

1. Invite-to-project UI using `project_members` (viewer/member).
2. Private project membership (not only public watches).
3. Co-scout / deal_actions for `member` role.
4. Upgrade on invite attempt for Free.
5. Optional filter chip: “Shared with friends” (`project_members` count > 0).

### Phase D — Stripe (separate)

Checkout, webhooks, customer portal; replace Coming soon.

---

## 9. Success metrics

| Metric | Target (first 30 days after Phase A) |
|---|---|
| Free → Pro conversion (among users hitting a gate) | Baseline; aim ≥5% of gated users |
| % of Free users who publish ≥1 public project | Rising (growth health) |
| Nightly scout API $ / Pro user | Stable or down vs ungated |
| Support tickets “I lost my projects” | ~0 (grandfather works) |
| Public feed density (public deals / week) | Not declining after gates |

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Cap 2 feels too tight | Telemetry on `project_limit` upgrades; raise Free to 3 if conversion angry |
| Pro 20 feels arbitrary | Copy “20 markets”; archive escapes; raise later |
| Users confuse Watch (Free) with Member (Pro) | Clear labels: “Watch feed” vs “Invite to scout together (Pro)” |
| Friends feed gated by mistake | Explicit: feed Free; collab Pro |
| Accidental bulk Make public | Confirm dialog + count; undo via bulk Make private |
| Bulk restore blows past Free cap | Server cap check; Upgrade or archive first |
| Stage 2 securities complexity | Keep capital flows out of this PRD |

---

## 11. Open questions

1. Free Friends feed: **full** (recommended) vs Pro-only?
2. Archived projects: new `archived_at` vs delete-only?
3. One free Catch-the-catch trial on Free?
4. Price point when Stripe lands: **$39/mo** or **$390/yr** (planning default)?
5. Mobile: enforce same entitlements in parked Expo app or web-only first?
6. Bulk **Delete** in v1, or Archive-only until later?
7. Default filter on `/projects`: **All** vs remember last filter in localStorage?

**Proposed defaults if unanswered:** (1) full Free feed, (2) `archived_at`, (3) yes one trial, (4) $39/$390, (5) web-first + shared `@papuc/core` helpers for later mobile, (6) Archive-only in v1 (no bulk delete), (7) All + persist last filter locally.

---

## 12. Acceptance criteria

- [ ] Free user cannot create a 3rd non-archived project (API + UI).
- [ ] Pro user can create up to 20; 21st blocked with clear message.
- [ ] Free user can browse public projects, follow, watch, share.
- [ ] Free user cannot invite members / join private collab; Upgrade with reason `invite_friend`.
- [ ] Nightly scout and digests run only for `subscription_tier = pro`.
- [ ] UpgradeDialog lists project cap, automation, and friend investing.
- [ ] Existing Free users with >2 projects are not deleted; only new creates blocked.
- [ ] Admin can still grant/revoke Pro and gates respect that immediately.
- [ ] `/projects` filters by All / Public / Private / Archived; cards show visibility badge.
- [ ] Owner can multi-select filtered projects and bulk make public, make private, archive, restore.
- [ ] Bulk restore and create both enforce tier project caps.
- [ ] Bulk nightly on/off is Pro-only; Free gets Upgrade with reason `nightly_scout`.

---

## Appendix A — One-liner

> Papuc Free: underwrite and discover in public. Papuc Pro: automate scouting and invest/scout with friends — up to 20 projects.

## Appendix B — Explicitly rejected

- Free = friends only, Pro = public discovery (inverted away; kills growth).
- Unlimited Free projects (unbounded cost).
- Monetizing browse/follow before collaboration exists.
