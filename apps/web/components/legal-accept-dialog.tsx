"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { LEGAL_VERSION } from "@/lib/legal";
import { acceptLegalTerms } from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";

/**
 * Blocking clickwrap. Parent mounts this only when the user has not accepted
 * the current LEGAL_VERSION.
 */
export function LegalAcceptDialog({
  onAccepted,
}: {
  onAccepted?: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    if (!checked) return;
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      await acceptLegalTerms(supabase);
      onAccepted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogTitle>Agree to continue</DialogTitle>
        <DialogDescription className="text-sm leading-6 mt-2">
          Before using Papuc, please review and accept our legal terms (version{" "}
          {LEGAL_VERSION}). Papuc is evaluation software—not a brokerage, MLS,
          or investment adviser.
        </DialogDescription>

        <ul className="mt-4 space-y-2 text-sm">
          <li>
            <Link
              href="/terms"
              target="_blank"
              className="text-primary underline"
            >
              Terms of Service
            </Link>
          </li>
          <li>
            <Link
              href="/privacy"
              target="_blank"
              className="text-primary underline"
            >
              Privacy Policy
            </Link>
          </li>
          <li>
            <Link
              href="/acceptable-use"
              target="_blank"
              className="text-primary underline"
            >
              Acceptable Use Policy
            </Link>
          </li>
          <li>
            <Link
              href="/data-disclaimer"
              target="_blank"
              className="text-primary underline"
            >
              Data &amp; Listings Disclaimer
            </Link>
          </li>
        </ul>

        <label className="mt-5 flex gap-3 items-start cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 size-4 rounded border-border"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span className="text-sm text-text leading-5">
            I have read and agree to the Terms of Service, Privacy Policy, and
            Acceptable Use Policy.
          </span>
        </label>

        {error ? (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 mt-3">
            <p className="text-danger text-xs">{error}</p>
          </div>
        ) : null}

        <DialogFooter className="!mt-6">
          <Button
            disabled={!checked}
            loading={submitting}
            onClick={() => void accept()}
            className="w-full sm:w-auto"
          >
            Agree and continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
