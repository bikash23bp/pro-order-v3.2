import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function DuplicateBadge({ className = "" }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={`bg-red-500/15 text-red-400 border-red-500/40 text-[10px] px-1 py-0 gap-1 ${className}`}
      title="Another order exists with the same phone number"
    >
      <AlertTriangle className="h-3 w-3" /> Duplicate
    </Badge>
  );
}
