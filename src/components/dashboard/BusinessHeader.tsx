import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Business = {
  business_name: string | null;
  business_address: string | null;
  business_phone: string | null;
  logo_url: string | null;
};

async function fetchBusiness(): Promise<Business | null> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("business_name, business_address, business_phone, logo_url")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return (data as Business) ?? null;
}

function BusinessHeaderInner() {
  const { data: business } = useQuery({
    queryKey: ["business-profile"],
    queryFn: fetchBusiness,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
      {business?.logo_url ? (
        <img
          src={business.logo_url}
          alt={business.business_name ?? "Logo"}
          className="h-12 w-12 rounded object-cover border"
        />
      ) : (
        <div className="h-12 w-12 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs">
          Logo
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-bold leading-tight truncate">
          {business?.business_name || "Your Business"}
        </h1>
        {business?.business_address && (
          <p className="text-xs text-muted-foreground truncate">{business.business_address}</p>
        )}
        {business?.business_phone && (
          <p className="text-xs text-muted-foreground truncate">{business.business_phone}</p>
        )}
      </div>
    </div>
  );
}

export const BusinessHeader = memo(BusinessHeaderInner);
