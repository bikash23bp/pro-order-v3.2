import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Database, ShieldAlert, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/hooks/use-auth";
import { runDatabaseSetup } from "@/lib/db-setup.functions";

export const Route = createFileRoute("/_app/db-setup")({
  head: () => ({ meta: [{ title: "Database Setup — OMS" }] }),
  component: DbSetupPage,
});

type StepResult = {
  name: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
  ms: number;
};

function DbSetupPage() {
  const { role } = useAuth();
  const run = useServerFn(runDatabaseSetup);
  const [connStr, setConnStr] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<StepResult[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; applied: number; skipped: number; failed: string | null } | null>(null);

  if (role !== "business_owner" && role !== "admin") {
    return (
      <Alert variant="destructive" className="max-w-2xl">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Forbidden</AlertTitle>
        <AlertDescription>শুধু সুপার অ্যাডমিন এই পেজ ব্যবহার করতে পারবে।</AlertDescription>
      </Alert>
    );
  }

  const onRun = async () => {
    if (!connStr.trim()) return toast.error("Connection string দিন");
    if (!confirm("আপনি কি নিশ্চিত? এটি টার্গেট ডাটাবেইজে সব মাইগ্রেশন রান করবে।")) return;
    setRunning(true);
    setResults(null);
    setSummary(null);
    try {
      const res = await run({ data: { connectionString: connStr.trim() } });
      setResults(res.results);
      setSummary({ total: res.total, applied: res.applied, skipped: res.skipped, failed: res.failed });
      if (res.failed) {
        toast.error(`Failed at: ${res.failed}`);
      } else {
        toast.success(`Done. Applied ${res.applied}, skipped ${res.skipped}.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Database className="h-6 w-6" /> Database Setup
        </h1>
        <p className="text-sm text-muted-foreground">
          অন্য Supabase প্রজেক্টে এই অ্যাপের সব টেবিল, RLS, ফাংশন এক ক্লিকে সেটআপ করুন।
        </p>
      </div>

      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>সতর্কতা</AlertTitle>
        <AlertDescription className="space-y-1 text-sm">
          <p>• Connection string টার্গেট Supabase-এর <b>direct database</b> URL হতে হবে।</p>
          <p>• Format: <code>postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres</code></p>
          <p>• Password পাবেন: Supabase Dashboard → Project Settings → Database → Connection string।</p>
          <p>• প্রতিটি মাইগ্রেশন এক transaction-এ চলবে। ব্যর্থ হলে সেখানেই থেমে যাবে।</p>
          <p>• আগের রান করা মাইগ্রেশন <code>_app_migrations</code> টেবিলে ট্র্যাক হবে — পুনরায় রান করলে skip হবে।</p>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Target Database</CardTitle>
          <CardDescription>Connection string টা এখানেই থাকবে, কোথাও save হবে না।</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Postgres Connection String</Label>
            <Input
              type="password"
              value={connStr}
              onChange={(e) => setConnStr(e.target.value)}
              placeholder="postgresql://postgres:...@db.xxxxx.supabase.co:5432/postgres"
              disabled={running}
            />
          </div>
          <Button onClick={onRun} disabled={running || !connStr.trim()}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            Run Setup
          </Button>
        </CardContent>
      </Card>

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">Total: {summary.total}</Badge>
            <Badge className="bg-green-600">Applied: {summary.applied}</Badge>
            <Badge variant="secondary">Skipped: {summary.skipped}</Badge>
            {summary.failed && <Badge variant="destructive">Failed: {summary.failed}</Badge>}
          </CardContent>
        </Card>
      )}

      {results && (
        <Card>
          <CardHeader>
            <CardTitle>Migrations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[480px] overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr className="text-left">
                    <th className="px-2 py-1.5 w-8"></th>
                    <th className="px-2 py-1.5">Migration</th>
                    <th className="px-2 py-1.5 w-16 text-right">ms</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.name} className="border-t align-top">
                      <td className="px-2 py-1.5">
                        {r.skipped ? (
                          <MinusCircle className="h-4 w-4 text-muted-foreground" />
                        ) : r.ok ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                      </td>
                      <td className="px-2 py-1.5 font-mono">
                        {r.name}
                        {r.error && (
                          <div className="mt-1 text-destructive whitespace-pre-wrap break-all">{r.error}</div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">{r.ms || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
