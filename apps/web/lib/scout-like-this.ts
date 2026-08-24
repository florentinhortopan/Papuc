import {
  ProjectConstraintsSchema,
  type ProjectConstraints,
} from "@papuc/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getDeal } from "./deals";
import { createProject, getProject, type ProjectRow } from "./projects";
import { followUser, watchProject } from "./social";

/** Clone scout filters from a source project; clamp to safe defaults. */
export function constraintsForScoutLikeThis(
  source: ProjectConstraints,
): ProjectConstraints {
  const cloned = ProjectConstraintsSchema.parse(
    JSON.parse(JSON.stringify(source)),
  );
  // Drop free-text notes/intent that belong to the other investor.
  delete cloned.notes;
  delete cloned.intent;
  if (cloned.minDSCR == null || cloned.minDSCR < 0.8) {
    cloned.minDSCR = 1.0;
  }
  if (cloned.minDSCR > 2.5) {
    cloned.minDSCR = 2.5;
  }
  return cloned;
}

function projectNameFromDeal(deal: {
  address: string | null;
  city: string | null;
  state: string | null;
}): string {
  const street = deal.address?.trim().split(",")[0]?.trim();
  const place = [deal.city, deal.state].filter(Boolean).join(", ");
  if (street && place) return `Like ${street} · ${place}`.slice(0, 80);
  if (street) return `Like ${street}`.slice(0, 80);
  if (place) return `Like ${place}`.slice(0, 80);
  return "Scout like this";
}

export type ScoutLikeThisResult = {
  project: ProjectRow;
  followedOwner: boolean;
  watchedSource: boolean;
};

/**
 * Create the viewer's project seeded from a public (or owned) deal's
 * source constraints, with attribution columns set.
 */
export async function scoutLikeThis(
  supabase: SupabaseClient,
  opts: {
    dealId: string;
    alsoFollowOwner?: boolean;
    alsoWatchProject?: boolean;
  },
): Promise<ScoutLikeThisResult> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("not signed in");

  const deal = await getDeal(supabase, opts.dealId);
  const sourceProject = await getProject(supabase, deal.project_id);

  if (!sourceProject.is_public && sourceProject.owner_id !== userId) {
    throw new Error("deal is not available for scout like this");
  }

  const constraints = constraintsForScoutLikeThis(sourceProject.constraints);
  const name = projectNameFromDeal(deal);
  const rawPrompt = `Scout like this: ${name}`;

  const project = await createProject(supabase, {
    name,
    rawPrompt,
    constraints,
    status: "active",
    sourceDealId: deal.id,
    sourceProjectId: sourceProject.id,
  });

  let followedOwner = false;
  let watchedSource = false;

  if (
    opts.alsoFollowOwner &&
    sourceProject.owner_id !== userId
  ) {
    try {
      await followUser(supabase, sourceProject.owner_id);
      followedOwner = true;
    } catch {
      // Non-fatal — project already created.
    }
  }

  if (
    opts.alsoWatchProject &&
    sourceProject.is_public &&
    sourceProject.owner_id !== userId
  ) {
    try {
      await watchProject(supabase, sourceProject.id);
      watchedSource = true;
    } catch {
      // Non-fatal.
    }
  }

  return { project, followedOwner, watchedSource };
}
