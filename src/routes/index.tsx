import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Package, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OMS — Pro Order Management" },
      { name: "description", content: "Modern e-commerce order management with inventory sync, courier integration and printable invoices." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [loading, session, navigate]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-accent/20">
      <header className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid place-items-center h-8 w-8 rounded-lg bg-primary text-primary-foreground">
            <Package className="h-4 w-4" />
          </div>
          <span className="font-semibold">OMS</span>
        </div>
        <Button asChild variant="outline" size="sm"><Link to="/auth">Sign in</Link></Button>
      </header>
      <main className="flex-1 grid place-items-center px-6">
        <div className="max-w-2xl text-center space-y-6">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Pro-level Order Management,<br />
            <span className="text-primary">built for speed.</span>
          </h1>
          <p className="text-muted-foreground text-lg">
            Manage products, orders, inventory, and courier shipments from one beautiful dashboard.
          </p>
          <Button asChild size="lg">
            <Link to="/auth">Get started <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
