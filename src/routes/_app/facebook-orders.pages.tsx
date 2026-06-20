import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { listFacebookPages, upsertFacebookPage, deleteFacebookPage } from "@/lib/facebook-orders.functions";

export const Route = createFileRoute("/_app/facebook-orders/pages")({
  component: FacebookPagesTab,
});

function FacebookPagesTab() {
  const fetchPages = useServerFn(listFacebookPages);
  const upsertPage = useServerFn(upsertFacebookPage);
  const deletePage = useServerFn(deleteFacebookPage);

  const q = useQuery({ queryKey: ["fb-pages"], queryFn: () => fetchPages() });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ page_id: "", page_name: "", access_token: "" });

  async function handleConnect() {
    if (!form.page_id || !form.page_name) {
      toast.error("Page ID and name are required");
      return;
    }
    try {
      await upsertPage({ data: form });
      toast.success("Page connected");
      setForm({ page_id: "", page_name: "", access_token: "" });
      setOpen(false);
      q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Disconnect this page?")) return;
    try {
      await deletePage({ data: { id } });
      toast.success("Page disconnected");
      q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  const pages = q.data?.pages ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" /> Connect Page</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Connect a Facebook Page</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Page Name</Label>
                <Input value={form.page_name} onChange={(e) => setForm({ ...form, page_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Page ID</Label>
                <Input value={form.page_id} onChange={(e) => setForm({ ...form, page_id: e.target.value })} className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <Label>Page Access Token (optional)</Label>
                <Input value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value })} className="font-mono text-xs" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleConnect}>Connect</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Page Name</TableHead>
              <TableHead>Page ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Connected</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : pages.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No pages connected.</TableCell></TableRow>
            ) : pages.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.page_name}</TableCell>
                <TableCell className="font-mono text-xs">{p.page_id}</TableCell>
                <TableCell><Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                <TableCell><Badge variant={p.token_status === "valid" ? "default" : "destructive"}>{p.token_status}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(p.connected_at).toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
