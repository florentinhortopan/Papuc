import { Badge } from "@/components/ui/badge";
import { formatDscr } from "@/lib/format";

export function DscrBadge({ dscr }: { dscr: number | null | undefined }) {
  if (dscr === null || dscr === undefined) {
    return <Badge>DSCR —</Badge>;
  }
  let variant: "success" | "warning" | "danger" = "danger";
  if (dscr >= 1.25) variant = "success";
  else if (dscr >= 1.0) variant = "warning";
  return <Badge variant={variant}>DSCR {formatDscr(dscr)}</Badge>;
}
