import type { ProjectConstraints } from "@papuc/core";
import { ProjectConstraintsSchema } from "@papuc/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";

import { ShareSocialBar } from "@/components/share-social-bar";
import { formatMarket, formatMoney } from "@/lib/format";
import { getSiteUrl } from "@/lib/site-url";
import { sanitizeShareToken } from "@/lib/share-token";
import {
  countProjectWatchers,
  getPublicProfile,
  isFollowingUser,
  isWatchingProject,
  publicDisplayName,
} from "@/lib/social";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SharedProject = {
  id: string;
  name: string;
  owner_id: string;
  raw_prompt: string;
  constraints: ProjectConstraints;
  is_public: boolean;
  last_scout_at: string | null;
};

const getSharedProject = cache(async (token: string) => {
  const clean = sanitizeShareToken(token);
  if (!clean) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("projects")
    .select("id, name, owner_id, raw_prompt, constraints, is_public, last_scout_at")
    .eq("share_token", clean)
    .maybeSingle();
  if (error || !data) return null;
  const constraints = ProjectConstraintsSchema.parse(data.constraints);
  return { ...(data as Omit<SharedProject, "constraints">), constraints };
});

function shortBrief(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  // Drop voice-transcript boilerplate if present.
  const cleaned = t
    .replace(/^Voice Concierge intake[\s\S]*?\n\n/i, "")
    .trim();
  const line = cleaned.slice(0, 140);
  return line.length < cleaned.length ? `${line}…` : line;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const project = await getSharedProject(token);
  if (!project) return { title: "Shared project — Papuc" };

  const c = project.constraints;
  const market = formatMarket(c.markets[0]);
  const title = `${project.name} · Papuc`;
  const description = [
    c.strategy,
    market,
    c.priceMax ? `≤ ${formatMoney(c.priceMax)}` : null,
    `DSCR ≥ ${c.minDSCR.toFixed(2)}`,
    "Public scout project — collaborate on scenario-ranked deals",
  ]
    .filter(Boolean)
    .join(" · ");

  const site = getSiteUrl();
  const cleanToken = sanitizeShareToken(token) ?? token;
  const ogImage = `${site}/api/og/project/${cleanToken}`;

  return {
    title,
    description,
    metadataBase: new URL(site),
    openGraph: {
      title: project.name,
      description,
      type: "website",
      url: `${site}/share/p/${cleanToken}`,
      siteName: "Papuc",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 800,
          alt: project.name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: project.name,
      description,
      images: [ogImage],
    },
  };
}

export default async function ProjectSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const project = await getSharedProject(token);
  if (!project) notFound();

  const admin = createAdminClient();
  const { count } = await admin
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("project_id", project.id)
    .eq("inventory_status", "live");

  const { data: sampleDeals } = await admin
    .from("deals")
    .select("primary_image_url, photos, address, city, state, price")
    .eq("project_id", project.id)
    .eq("inventory_status", "live")
    .order("last_refreshed_at", { ascending: false })
    .limit(3);

  const photos: string[] = [];
  for (const d of sampleDeals ?? []) {
    const fromPhotos = Array.isArray(d.photos)
      ? (d.photos as unknown[]).find(
          (p): p is string => typeof p === "string" && p.startsWith("http"),
        )
      : undefined;
    const url =
      (typeof d.primary_image_url === "string" && d.primary_image_url) ||
      fromPhotos;
    if (url && !photos.includes(url)) photos.push(url);
    if (photos.length >= 3) break;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedIn = user !== null;
  const isOwner = signedIn && user.id === project.owner_id;
  const cleanToken = sanitizeShareToken(token) ?? token;
  const signUpHref = `/sign-in?next=${encodeURIComponent(`/share/p/${cleanToken}`)}`;

  // Share pages are public; resolve display name with admin (anon can't
  // read public_profiles via the user client).
  const ownerProfile = await getPublicProfile(admin, project.owner_id);
  const ownerDisplayName = ownerProfile
    ? publicDisplayName(ownerProfile)
    : "Investor";

  let initialFollowing = false;
  let initialWatching = false;
  let watcherCount = 0;
  if (project.is_public) {
    watcherCount = await countProjectWatchers(admin, project.id);
  }
  if (signedIn && !isOwner) {
    initialFollowing = await isFollowingUser(
      supabase,
      user.id,
      project.owner_id,
    );
    if (project.is_public) {
      initialWatching = await isWatchingProject(
        supabase,
        project.id,
        user.id,
      );
    }
  }

  const c = project.constraints;
  const market = formatMarket(c.markets[0]);
  const dealCount = count ?? 0;
  const brief = shortBrief(project.raw_prompt);

  return (
    <main className="min-h-screen">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <p className="font-bold text-lg">
            Papuc{" "}
            <span className="text-textMuted font-normal text-xs">
              AI deal scout
            </span>
          </p>
          {signedIn ? (
            <Link href="/projects" className="text-primary text-sm hover:underline">
              My projects →
            </Link>
          ) : (
            <Link href={signUpHref} className="text-primary text-sm hover:underline">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <p className="text-textMuted text-xs">
          {ownerDisplayName} shared this scout project with you.
        </p>

        {!isOwner ? (
          <ShareSocialBar
            ownerId={project.owner_id}
            ownerDisplayName={ownerDisplayName}
            projectId={project.id}
            projectName={project.name}
            isPublic={project.is_public}
            isOwner={isOwner}
            signedIn={signedIn}
            initialFollowing={initialFollowing}
            initialWatching={initialWatching}
            watcherCount={watcherCount}
            signInHref={signUpHref}
          />
        ) : null}

        {photos.length > 0 ? (
          <div
            className={`grid gap-1.5 rounded-2xl overflow-hidden ${
              photos.length > 1 ? "grid-cols-[2fr,1fr]" : ""
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[0]}
              alt={project.name}
              className="w-full h-56 sm:h-72 object-cover"
            />
            {photos.length > 1 ? (
              <div className="grid gap-1.5">
                {photos.slice(1, 3).map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={p}
                    src={p}
                    alt=""
                    className="w-full h-[calc(7rem-3px)] sm:h-[calc(9rem-3px)] object-cover"
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{project.name}</h1>
          <p className="text-textMuted text-sm mt-2 leading-6">{brief}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip>
            {dealCount === 1 ? "1 deal" : `${dealCount} deals`}
          </Chip>
          <Chip>{market}</Chip>
          <Chip>{c.strategy}</Chip>
          {c.priceMax ? <Chip>≤ {formatMoney(c.priceMax)}</Chip> : null}
          <Chip>DSCR ≥ {c.minDSCR.toFixed(2)}</Chip>
        </div>

        <div className="bg-primary/10 border border-primary/30 rounded-2xl p-5 text-center space-y-3">
          <p className="text-text text-base font-semibold">
            Papuc scouts and underwrites deals that match this brief.
          </p>
          <p className="text-textMuted text-sm leading-6">
            {signedIn && !isOwner
              ? "Follow the investor and watch this scout so new public finds land in Friends — or open the project if it’s on Discover."
              : "Sign in free to follow the investor, watch this scout, and clone filters like these."}
          </p>
          {isOwner ? (
            <Link
              href={`/projects/${project.id}`}
              className="inline-flex items-center justify-center rounded-xl bg-primary text-white text-sm font-semibold px-5 py-2.5 hover:opacity-90"
            >
              Open in your workspace
            </Link>
          ) : signedIn && project.is_public ? (
            <Link
              href={`/projects/${project.id}`}
              className="inline-flex items-center justify-center rounded-xl bg-primary text-white text-sm font-semibold px-5 py-2.5 hover:opacity-90"
            >
              Open public scout
            </Link>
          ) : (
            <Link
              href={signedIn ? "/projects" : signUpHref}
              className="inline-flex items-center justify-center rounded-xl bg-primary text-white text-sm font-semibold px-5 py-2.5 hover:opacity-90"
            >
              {signedIn ? "Go to my projects" : "Sign in to scout free"}
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-text">
      {children}
    </span>
  );
}
