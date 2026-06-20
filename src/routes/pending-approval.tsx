import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, ShieldCheck, Mail, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/pending-approval")({
  head: () => ({ meta: [{ title: "Pending Approval — OMS" }] }),
  component: PendingApprovalPage,
});

function PendingApprovalPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-accent/20">
      <Card className="w-full max-w-md border border-primary/10 shadow-2xl shadow-primary/5">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 grid place-items-center h-16 w-16 rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Your signup is successful
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Waiting for admin confirmation
          </p>
        </CardHeader>
        <CardContent className="space-y-6 pb-8">
          <div className="rounded-xl bg-muted/50 border border-border p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-8 w-8 rounded-lg bg-primary/10 grid place-items-center shrink-0">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Under Review</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  An admin is reviewing your account request. This usually takes a few minutes.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-8 w-8 rounded-lg bg-primary/10 grid place-items-center shrink-0">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Stay Tuned</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  You will be notified once your access is approved.
                </p>
              </div>
            </div>
          </div>

          <Button asChild variant="outline" className="w-full" size="lg">
            <Link to="/auth">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Sign In
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
