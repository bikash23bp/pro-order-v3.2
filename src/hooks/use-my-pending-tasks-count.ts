import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export function useMyPendingTasksCount() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id ?? null;

  const query = useQuery({
    queryKey: ["my-pending-tasks-count", userId, isAdmin],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return 0;
      let q = supabase
        .from("tasks")
        .select("id", { head: true, count: "exact" })
        .in("status", ["pending", "on_hold"]);
      if (!isAdmin) q = q.eq("assigned_to", userId);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (!userId) return;
    let scheduled = false;
    const ping = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        qc.invalidateQueries({ queryKey: ["my-pending-tasks-count"] });
        qc.invalidateQueries({ queryKey: ["tasks"] });
      }, 1500);
    };
    const channel = supabase
      .channel(`tasks-badge-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        ping,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);


  return query.data ?? 0;
}
