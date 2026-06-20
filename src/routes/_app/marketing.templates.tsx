import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, Save } from "lucide-react";
import { listTemplates, saveTemplate, deleteTemplate, type MessageTemplate } from "@/lib/marketing.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_app/marketing/templates")({
  head: () => ({ meta: [{ title: "Templates — Marketing" }] }),
  component: TemplatesTab,
});

function TemplatesTab() {
  const fetchAll = useServerFn(listTemplates);
  const save = useServerFn(saveTemplate);
  const del = useServerFn(deleteTemplate);

  const [channel, setChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const [rows, setRows] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try { setRows((await fetchAll({ data: { channel } })) as MessageTemplate[]); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [channel]);

  const openNew = () => { setEditing(null); setName(""); setBody(""); setOpen(true); };
  const openEdit = (t: MessageTemplate) => { setEditing(t); setName(t.name); setBody(t.body); setOpen(true); };

  const handleSave = async () => {
    if (!name.trim() || !body.trim()) return toast.error("Name and body required");
    setSaving(true);
    try {
      await save({ data: { id: editing?.id, channel, name: name.trim(), body: body.trim() } });
      toast.success(editing ? "Template updated" : "Template created");
      setOpen(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  };

  const handleDelete = async (t: MessageTemplate) => {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    try { await del({ data: { id: t.id } }); toast.success("Deleted"); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Message templates</CardTitle>
          <CardDescription>Reusable WhatsApp and SMS message bodies.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={channel} onValueChange={(v) => setChannel(v as "whatsapp" | "sms")}>
            <TabsList>
              <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
              <TabsTrigger value="sms">SMS</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4" />New</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Body</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No templates yet.</TableCell></TableRow>
            ) : rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    {t.name}
                    <Badge variant="outline" className="text-[10px]">{t.channel}</Badge>
                  </span>
                </TableCell>
                <TableCell className="max-w-md truncate text-muted-foreground" title={t.body}>{t.body}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(t.updated_at).toLocaleString()}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(t)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit template" : "New template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Order confirmation" maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label>Body</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={4000} placeholder="Hi {{name}}, your order is on the way." />
              <p className="text-xs text-muted-foreground">Supports <code>{"{{name}}"}</code> and <code>{"{{phone}}"}</code>.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
