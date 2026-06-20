import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Notice = { id: string; message: string; active: boolean; created_at: string };

export function NoticeMarquee() {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data, error } = await (supabase as any)
        .from("notices")
        .select("id, message, active, created_at")
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (!mounted) return;
      if (error) {
        // table may not exist yet on user's DB
        setNotices([]);
        return;
      }
      setNotices((data ?? []) as Notice[]);
    };
    load();
    const ch = supabase
      .channel(`notices-marquee-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notices" }, load)
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, []);

  if (!notices.length) return null;

  const text = notices.map((n) => n.message).join("   •   ");

  return (
    <div className="h-9 border-b bg-primary/10 text-primary-foreground/90 overflow-hidden relative print:hidden">
      <div className="absolute inset-0 flex items-center">
        <div
          className="whitespace-nowrap will-change-transform animate-[notice-scroll_40s_linear_infinite] text-sm font-medium text-primary"
          style={{ paddingLeft: "100%" }}
        >
          {text}   •   {text}
        </div>
      </div>
      <style>{`
        @keyframes notice-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
