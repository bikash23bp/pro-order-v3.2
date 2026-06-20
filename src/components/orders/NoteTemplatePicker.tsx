import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Template = { id: string; kind: string; label: string; body: string };

export function NoteTemplatePicker({
  kind,
  onPick,
}: {
  kind: "shipping" | "invoice" | "internal";
  onPick: (text: string) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const q = useQuery({
    queryKey: ["note-templates", kind],
    enabled: open,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("note_templates")
        .select("id, kind, label, body")
        .eq("kind", kind)
        .order("label");
      if (error) throw new Error(error.message);
      return (data ?? []) as Template[];
    },
  });

  const save = async () => {
    if (!label.trim() || !body.trim()) {
      toast.error("Label এবং Body দুটোই দিন");
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { data: inserted, error } = await supabase
      .from("note_templates")
      .insert({
        kind,
        label: label.trim(),
        body: body.trim(),
        created_by: userData.user?.id ?? null,
      })
      .select("id, kind, label, body")
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Template saved");
    setLabel("");
    setBody("");
    setAdding(false);
    // Optimistically update cache so it appears immediately
    qc.setQueryData<Template[]>(["note-templates", kind], (old) => {
      const next = [...(old ?? []), inserted as Template];
      return next.sort((a, b) => a.label.localeCompare(b.label));
    });
    await qc.invalidateQueries({ queryKey: ["note-templates", kind] });
    await q.refetch();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("note_templates").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["note-templates", kind] });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 px-2">
          <Plus className="h-3.5 w-3.5" /> Template
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-2"
        align="end"
        onKeyDown={(e) => {
          // Prevent Enter from submitting the parent form
          if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
            e.preventDefault();
          }
        }}
      >
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {q.isLoading ? (
            <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin mr-1" /> Loading…
            </div>
          ) : (q.data ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground p-2">কোনো টেমপ্লেট নেই</div>
          ) : (
            (q.data ?? []).map((t) => (
              <div key={t.id} className="flex items-start gap-1 hover:bg-muted rounded p-1">
                <button
                  type="button"
                  className="flex-1 text-left text-xs"
                  onClick={() => {
                    onPick(t.body);
                    setOpen(false);
                  }}
                >
                  <div className="font-medium">{t.label}</div>
                  <div className="text-muted-foreground line-clamp-2">{t.body}</div>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive"
                  onClick={() => remove(t.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
        <div className="border-t mt-2 pt-2">
          {!adding ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs"
              onClick={() => setAdding(true)}
            >
              <Plus className="h-3 w-3" /> নতুন টেমপ্লেট
            </Button>
          ) : (
            <div className="space-y-2">
              <Input
                placeholder="Label (e.g. Call before delivery)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="h-8 text-xs"
              />
              <Textarea
                placeholder="Note text…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                className="text-xs"
              />
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
