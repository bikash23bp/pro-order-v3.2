// Server-only: bundles all SQL migrations as raw strings at build time.
// Imported only from db-setup.functions.ts inside a server handler.

const modules = import.meta.glob("../../supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export type Migration = { name: string; sql: string };

export function getAllMigrations(): Migration[] {
  return Object.entries(modules)
    .map(([path, sql]) => ({
      name: path.split("/").pop() ?? path,
      sql,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
