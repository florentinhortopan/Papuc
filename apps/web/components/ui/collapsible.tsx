"use client";

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;

function CollapsibleContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      className={cn("overflow-hidden", className)}
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
