"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Input } from "./input";
import { Label } from "./label";

export interface FieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string;
  hint?: string;
  className?: string;
}

const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ label, hint, className, ...props }, ref) => {
    const id = React.useId();
    return (
      <div className={cn("mb-3", className)}>
        <Label htmlFor={id}>{label}</Label>
        <Input ref={ref} id={id} {...props} />
        {hint ? <p className="text-xs text-textMuted mt-1">{hint}</p> : null}
      </div>
    );
  },
);
Field.displayName = "Field";

export { Field };
