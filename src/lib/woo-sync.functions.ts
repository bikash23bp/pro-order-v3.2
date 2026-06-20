import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type WooProduct = {
  id: number;
  name: string;
  sku: string;
  description: string;
  price: string;
  regular_price: string;
  stock_quantity: number | null;
  manage_stock: boolean;
  images: { src: string }[];
  status: string;
  type?: string; // "simple" | "variable" | "grouped" | "external"
  variations?: number[];
};

type WooVariation = {
  id: number;
  sku: string;
  price: string;
  regular_price: string;
  stock_quantity: number | null;
  manage_stock: boolean;
  image?: { src: string } | null;
  status: string;
  attributes?: { name: string; option: string }[];
};


type WooOrder = {
  id: number;
  number: string;
  status: string;
  total: string;
  shipping_total: string;
  discount_total: string;
  date_created: string;
  billing: {
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
  };
  line_items: { product_id: number; name: string; quantity: number; total: string; sku: string }[];
  customer_note: string;
};

async function fetchWoo<T>(siteUrl: string, ck: string, cs: string, path: string): Promise<T> {
  const auth = Buffer.from(`${ck}:${cs}`).toString("base64");
  const url = `${siteUrl.replace(/\/+$/, "")}/wp-json/wc/v3${path}`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error(`WooCommerce ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  return (await res.json()) as T;
}

async function fetchAllWoo<T>(siteUrl: string, ck: string, cs: string, basePath: string, perPage = 100, maxPages = 20): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = basePath.includes("?") ? "&" : "?";
    const batch = await fetchWoo<T[]>(siteUrl, ck, cs, `${basePath}${sep}per_page=${perPage}&page=${page}`);
    out.push(...batch);
    if (batch.length < perPage) break;
  }
  return out;
}

const WOO_TO_OMS_STATUS: Record<string, string> = {
  pending: "processing",
  "on-hold": "processing",
  processing: "processing",
  completed: "completed",
  cancelled: "cancelled",
  refunded: "returned",
  failed: "cancelled",
};

export const syncWooProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ integration_id: z.string().uuid().optional() }).parse(input ?? {})
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const q = supabase
      .from("integrations")
      .select("id, name, site_url, consumer_key, consumer_secret, enabled")
      .eq("provider", "woocommerce")
      .eq("enabled", true);
    const { data: sites, error: sErr } = data.integration_id
      ? await q.eq("id", data.integration_id)
      : await q;
    if (sErr) throw new Error(sErr.message);
    if (!sites || sites.length === 0) throw new Error("No active WooCommerce sites configured.");

    let created = 0, updated = 0, failed = 0;
    for (const s of sites) {
      if (!s.site_url || !s.consumer_key || !s.consumer_secret) { failed++; continue; }
      try {
        const products = await fetchAllWoo<WooProduct>(s.site_url, s.consumer_key, s.consumer_secret, "/products?status=any");

        // Helper: upsert one OMS product row + its external ref. Returns local product id.
        const upsertProduct = async (args: {
          name: string;
          description: string;
          sku: string;
          price: number;
          stock: number;
          image_url: string | null;
          status: "active" | "inactive";
          externalProductId: string;
          externalVariantId: string; // "" for simple parent, otherwise variation id
        }): Promise<string | null> => {
          const { data: existing } = await supabase
            .from("products").select("id").eq("sku", args.sku).maybeSingle();
          let productId: string | null = existing?.id ?? null;
          if (existing) {
            const { error } = await supabase
              .from("products")
              .update({
                name: args.name, description: args.description,
                price: args.price, stock_quantity: args.stock,
                image_url: args.image_url, status: args.status,
              })
              .eq("id", existing.id);
            if (error) { failed++; return null; }
            updated++;
          } else {
            const { data: inserted, error } = await supabase
              .from("products")
              .insert({
                name: args.name, description: args.description, sku: args.sku,
                price: args.price, cost_price: 0, stock_quantity: args.stock,
                image_url: args.image_url, status: args.status,
              })
              .select("id").single();
            if (error || !inserted) { failed++; return null; }
            created++;
            productId = inserted.id;
          }
          if (productId) {
            await supabase.from("product_external_refs").upsert(
              {
                product_id: productId,
                source: "woocommerce",
                source_site_id: s.id,
                external_product_id: args.externalProductId,
                external_variant_id: args.externalVariantId,
              },
              { onConflict: "source,source_site_id,external_product_id,external_variant_id" },
            );
          }
          return productId;
        };

        for (const p of products) {
          const isVariable = p.type === "variable" || (Array.isArray(p.variations) && p.variations.length > 0);

          if (!isVariable) {
            // Simple/external/grouped product → one OMS product as before
            const price = Number(p.price || p.regular_price || 0);
            const stock = p.manage_stock ? Number(p.stock_quantity ?? 0) : 0;
            const image_url = p.images?.[0]?.src ?? null;
            const sku = (p.sku || `woo-${s.id.slice(0, 8)}-${p.id}`).trim();
            await upsertProduct({
              name: p.name, description: p.description, sku,
              price, stock, image_url,
              status: p.status === "publish" ? "active" : "inactive",
              externalProductId: String(p.id),
              externalVariantId: "",
            });
            continue;
          }

          // Variable product → fetch each variation and store as its own OMS product
          let variations: WooVariation[] = [];
          try {
            variations = await fetchAllWoo<WooVariation>(
              s.site_url, s.consumer_key, s.consumer_secret,
              `/products/${p.id}/variations?status=any`,
              100, 10,
            );
          } catch (e) {
            console.error(`[woo-sync variations] ${p.id}:`, e);
            failed++;
            continue;
          }

          if (variations.length === 0) {
            // Variable parent with no variations published → skip silently
            continue;
          }

          const parentImage = p.images?.[0]?.src ?? null;
          for (const v of variations) {
            const attrs = (v.attributes ?? []).map((a) => a.option).filter(Boolean).join(" / ");
            const varName = attrs ? `${p.name} — ${attrs}` : p.name;
            const price = Number(v.price || v.regular_price || p.price || p.regular_price || 0);
            const stock = v.manage_stock ? Number(v.stock_quantity ?? 0) : (p.manage_stock ? Number(p.stock_quantity ?? 0) : 0);
            const image_url = v.image?.src ?? parentImage;
            const sku = (v.sku || `woo-${s.id.slice(0, 8)}-${p.id}-v${v.id}`).trim();
            await upsertProduct({
              name: varName,
              description: p.description,
              sku,
              price,
              stock,
              image_url,
              status: v.status === "publish" ? "active" : "inactive",
              externalProductId: String(p.id),
              externalVariantId: String(v.id),
            });
          }
        }
      } catch (e) {
        console.error(`[woo-sync products] ${s.name}:`, e);
        failed++;
      }
    }
    return { created, updated, failed, sites: sites.length };
  });


export const syncWooOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ integration_id: z.string().uuid().optional() }).parse(input ?? {})
  )
  .handler(async ({ data, context }) => {
    const { syncWooOrdersAll } = await import("./woo-sync.server");
    const summary = await syncWooOrdersAll(context.supabase, {
      integrationId: data.integration_id,
    });
    if (summary.sites === 0) {
      throw new Error("No active WooCommerce sites configured.");
    }
    return summary;
  });
