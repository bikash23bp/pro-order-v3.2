import { createFileRoute } from "@tanstack/react-router";
import { PhoneCall } from "lucide-react";

export const Route = createFileRoute("/auto-call")({
  head: () => ({
    meta: [
      { title: "Auto Call System — Coming Soon" },
      { name: "description", content: "Automated calling system. Coming soon." },
    ],
  }),
  component: AutoCallPage,
});

function AutoCallPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
          <PhoneCall className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-semibold">Auto Call System</h1>
        <p className="text-muted-foreground">Coming soon.</p>
      </div>
    </div>
  );
}
