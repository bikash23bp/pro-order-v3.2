import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type RunInput = {
  connectionString: string; // postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres
};

type StepResult = {
  name: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
  ms: number;
};

async function assertCanManageDbSetup(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_permissions")
    .select("can_manage_db_setup")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Permission check failed: " + error.message);
  if (!data?.can_manage_db_setup) {
    throw new Error("Forbidden: Manage Database Setup permission required");
  }
}


export const runDatabaseSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: RunInput) => {
    if (!input?.connectionString || typeof input.connectionString !== "string") {
      throw new Error("connectionString required");
    }
    if (!input.connectionString.startsWith("postgres")) {
      throw new Error("Invalid Postgres connection string");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertCanManageDbSetup(context.supabase, context.userId);

    const { getAllMigrations } = await import("./db-setup.server");
    const { Client } = await import("pg");

    const migrations = getAllMigrations();
    const results: StepResult[] = [];

    const client = new Client({
      connectionString: data.connectionString,
      ssl: { rejectUnauthorized: false },
      // 60s statement timeout per migration
      statement_timeout: 60_000,
    });

    try {
      await client.connect();
    } catch (e) {
      throw new Error(
        "Could not connect to target database: " +
          (e instanceof Error ? e.message : String(e)),
      );
    }

    try {
      // Bootstrap a tracking table so reruns skip applied migrations.
      await client.query(`
        CREATE SCHEMA IF NOT EXISTS public;
        CREATE TABLE IF NOT EXISTS public._app_migrations (
          name text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        );
      `);

      const { rows: appliedRows } = await client.query<{ name: string }>(
        "SELECT name FROM public._app_migrations",
      );
      const applied = new Set(appliedRows.map((r) => r.name));

      for (const m of migrations) {
        const started = Date.now();
        if (applied.has(m.name)) {
          results.push({ name: m.name, ok: true, skipped: true, ms: 0 });
          continue;
        }
        try {
          await client.query("BEGIN");
          await client.query(m.sql);
          await client.query(
            "INSERT INTO public._app_migrations(name) VALUES ($1) ON CONFLICT DO NOTHING",
            [m.name],
          );
          await client.query("COMMIT");
          results.push({ name: m.name, ok: true, ms: Date.now() - started });
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {});
          results.push({
            name: m.name,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
            ms: Date.now() - started,
          });
          // Stop on first failure — migrations are order-dependent
          break;
        }
      }
    } finally {
      await client.end().catch(() => {});
    }

    const applied = results.filter((r) => r.ok && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.find((r) => !r.ok);
    return {
      total: migrations.length,
      applied,
      skipped,
      failed: failed ? failed.name : null,
      results,
    };
  });
