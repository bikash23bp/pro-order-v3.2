import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { AllCustomersTab } from "@/components/customers/AllCustomersTab";
import { MembershipTab } from "@/components/customers/MembershipTab";
import { RepeatCustomersTab } from "@/components/customers/RepeatCustomersTab";
import { TaggedCustomersTab } from "@/components/customers/TaggedCustomersTab";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({
  tab: z.enum(["all", "repeat", "tagged", "membership", "retail", "wholesale"]).optional(),
});

export const Route = createFileRoute("/_app/customers/")({
  head: () => ({ meta: [{ title: "Customers — OMS" }] }),
  validateSearch: searchSchema,
  component: CustomersPage,
});

type Tab = "all" | "repeat" | "tagged" | "membership" | "retail" | "wholesale";

function CustomersPage() {
  const search = useSearch({ from: "/_app/customers/" });
  const navigate = useNavigate({ from: "/_app/customers/" });
  const tab: Tab = search.tab ?? "all";

  // Realtime: notify all customer tabs when orders or tags change.
  useEffect(() => {
    let scheduled = false;
    const ping = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        window.dispatchEvent(new Event("customers:refresh"));
      }, 800);
    };
    const ch = supabase
      .channel("customers-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_tags" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "membership_customers" }, ping)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const title = tab === "retail" ? "Retail Customers"
    : tab === "wholesale" ? "Wholesale Customers"
    : "Customers";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">Manage your customer base, repeat buyers, tagged segments and membership program.</p>
      </div>
      <Tabs value={tab} onValueChange={(v) => navigate({ search: { tab: v as Tab } })} className="space-y-4">
        <TabsContent value="all" className="space-y-4">
          <AllCustomersTab />
        </TabsContent>
        <TabsContent value="retail" className="space-y-4">
          <AllCustomersTab customerType="retail" />
        </TabsContent>
        <TabsContent value="wholesale" className="space-y-4">
          <AllCustomersTab customerType="wholesale" />
        </TabsContent>
        <TabsContent value="repeat" className="space-y-4">
          <RepeatCustomersTab />
        </TabsContent>
        <TabsContent value="tagged" className="space-y-4">
          <TaggedCustomersTab />
        </TabsContent>
        <TabsContent value="membership" className="space-y-4">
          <MembershipTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
