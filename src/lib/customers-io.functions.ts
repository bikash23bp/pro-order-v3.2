import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RowSchema = z.object({
  name: z.string().trim().max(500).optional().nullable(),
  phone: z.string().trim().min(1).max(64),
  address: z.string().trim().max(2000).optional().nullable(),
});

export const importCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      rows: z.array(RowSchema).min(1).max(2000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const seen = new Set<string>();
    const rows = data.rows
      .map((r) => ({
        name: r.name?.trim() || null,
        phone: r.phone.trim(),
        address: r.address?.trim() || null,
        created_by: userId,
      }))
      .filter((r) => {
        const key = r.phone.trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    if (rows.length === 0) return { inserted: 0, skipped: data.rows.length };

    // Skip phones that already exist (table has no unique constraint on phone)
    const phones = rows.map((r) => r.phone);
    const { data: existing, error: selErr } = await supabase
      .from("imported_customers")
      .select("phone")
      .in("phone", phones);
    if (selErr) throw new Error(selErr.message);
    const existingSet = new Set((existing ?? []).map((e) => e.phone));
    const toInsert = rows.filter((r) => !existingSet.has(r.phone));

    if (toInsert.length === 0) return { inserted: 0, skipped: data.rows.length };

    const { error, count } = await supabase
      .from("imported_customers")
      .insert(toInsert, { count: "exact" });
    if (error) throw new Error(error.message);
    const inserted = count ?? toInsert.length;
    return { inserted, skipped: data.rows.length - inserted };
  });
