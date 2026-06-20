import { Inbox } from "lucide-react";

export function EmptyCapability({ message, error }: { message?: string; error?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
      <div className="rounded-full bg-muted p-3">
        <Inbox className="h-5 w-5" />
      </div>
      <p className="text-sm">{message ?? "এই কুরিয়ারের API থেকে এই তথ্য পাওয়া যায়নি"}</p>
      {error && <p className="text-xs text-destructive/80">{error}</p>}
    </div>
  );
}
