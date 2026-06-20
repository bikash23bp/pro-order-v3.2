import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const runWpIncompleteSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ integration_id: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { syncWpIncomplete } = await import("./wp-incomplete-sync.server");
    const summary = await syncWpIncomplete(context.supabase, {
      integrationId: data.integration_id,
    });
    if (summary.sites === 0) {
      throw new Error("No active WooCommerce sites configured.");
    }
    return summary;
  });

export type WpIncompleteSyncLog = {
  id: string;
  integration_id: string | null;
  site_name: string | null;
  fetched: number;
  created: number;
  skipped_no_phone: number;
  skipped_dup: number;
  failed: number;
  marked_imported: number;
  imported_ids: number[];
  error: string | null;
  created_at: string;
};

export const listWpIncompleteSyncLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("wp_incomplete_sync_logs" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as WpIncompleteSyncLog[];
  });
