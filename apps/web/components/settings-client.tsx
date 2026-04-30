"use client";

import { useState } from "react";

import { SignOutButton } from "@/components/sign-out-button";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SubscriptionTier } from "@/lib/database.types";

export function SettingsClient({
  email,
  tier,
}: {
  email: string | null;
  tier: SubscriptionTier;
}) {
  const [showUpgrade, setShowUpgrade] = useState(false);
  return (
    <div className="max-w-md">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>

      <div className="bg-surface border border-border rounded-2xl p-4 mb-3">
        <p className="text-textMuted text-xs">Signed in as</p>
        <p className="text-text text-base mt-1">{email ?? "—"}</p>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-4 mb-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-textMuted text-xs">Plan</p>
          <Badge variant={tier === "pro" ? "primary" : "muted"}>
            {tier.toUpperCase()}
          </Badge>
        </div>
        <p className="text-text text-base mt-1">
          {tier === "pro"
            ? "Background scouting + alerts enabled"
            : "Free plan — manual scouting only"}
        </p>
        {tier !== "pro" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowUpgrade(true)}
            className="mt-3"
          >
            See Papuc Pro
          </Button>
        ) : null}
      </div>

      <div className="mt-6">
        <SignOutButton />
      </div>

      <UpgradeDialog
        open={showUpgrade}
        onOpenChange={setShowUpgrade}
        feature="Unlock background scouting, email alerts, and pro-forma exports."
      />
    </div>
  );
}
