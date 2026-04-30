import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        muted: "bg-surfaceAlt border-border text-text",
        success: "bg-success/10 border-success/30 text-success",
        danger: "bg-danger/10 border-danger/30 text-danger",
        warning: "bg-warning/10 border-warning/30 text-warning",
        primary: "bg-primary/15 border-primary/40 text-primary",
      },
    },
    defaultVariants: { variant: "muted" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
