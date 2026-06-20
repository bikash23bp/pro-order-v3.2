import { useState } from "react";
import { Upload, Loader2, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  value: string | null;
  onChange: (url: string | null) => void;
  bucket?: string;
  folder?: string;
};

export function ProductImageUpload({ value, onChange, bucket = "product-images", folder = "" }: Props) {
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) return toast.error("Image must be under 5MB");
    setBusy(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${folder ? folder + "/" : ""}${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: false,
      contentType: file.type,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    onChange(data.publicUrl);
    toast.success("Image uploaded");
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        {value ? (
          <div className="relative h-20 w-20 shrink-0 rounded-md border bg-muted overflow-hidden">
            <img src={value} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5 hover:bg-background"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <label className="flex h-20 w-20 shrink-0 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed text-muted-foreground hover:bg-muted/50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            <span className="text-[10px] mt-1">Upload</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </label>
        )}
        <div className="flex-1 space-y-1">
          <Input
            placeholder="Image URL"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
          />
          {value && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                navigator.clipboard.writeText(value);
                toast.success("Link copied");
              }}
            >
              <Copy className="h-3 w-3" />Copy link
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
