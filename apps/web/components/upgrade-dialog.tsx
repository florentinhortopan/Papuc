"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

export function UpgradeDialog({
  open,
  onOpenChange,
  feature,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Papuc Pro</DialogTitle>
        <DialogDescription>{feature}</DialogDescription>
        <div className="bg-surfaceAlt border border-border rounded-2xl p-4 mt-4">
          <p className="text-text font-semibold mb-2">Pro includes</p>
          <ul className="space-y-1">
            <Bullet>Background scouting (nightly per project)</Bullet>
            <Bullet>Email alerts for new high-score deals</Bullet>
            <Bullet>Side-by-side comparing 3+ deals</Bullet>
            <Bullet>CSV pro-forma export</Bullet>
            <Bullet>Priority MLS rate limits</Bullet>
          </ul>
        </div>
        <p className="text-textMuted text-xs mt-3">
          Stripe billing is wired up in a follow-up; this is a placeholder for
          the MVP.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
          <Button disabled>Coming soon</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Bullet({ children }: { children: string }) {
  return (
    <li className="flex gap-2 text-sm">
      <span className="text-primary">•</span>
      <span className="text-text">{children}</span>
    </li>
  );
}
