import { useRef, useState } from "react";
import { Camera, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { processAvatar, validateAvatarFile } from "@/lib/avatar-upload";

type Props = {
  /** Current avatar URL (or null) to display when no new preview is selected. */
  value: string | null;
  /** Called with the processed File + dataUrl, or (null, null) when removed. */
  onChange: (file: File | null, dataUrl: string | null) => void;
  /** Fallback initials when no image. */
  fallback?: string;
  /** px size for the avatar circle. Default 96. */
  size?: number;
  disabled?: boolean;
  className?: string;
};

export function AvatarUploader({ value, onChange, fallback, size = 96, disabled, className }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const display = preview ?? value;

  async function handleFile(file: File) {
    const err = validateAvatarFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setProcessing(true);
    try {
      const { file: processed, dataUrl } = await processAvatar(file);
      setPreview(dataUrl);
      onChange(processed, dataUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to process image");
    } finally {
      setProcessing(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }

  function remove() {
    setPreview(null);
    onChange(null, null);
  }

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !disabled && !processing && inputRef.current?.click()}
        className={cn(
          "group relative shrink-0 cursor-pointer overflow-hidden rounded-full ring-2 ring-border transition-all",
          "hover:ring-primary/60 hover:shadow-lg",
          dragOver && "ring-primary scale-[1.03]",
          disabled && "cursor-not-allowed opacity-60"
        )}
        style={{ width: size, height: size }}
        role="button"
        aria-label="Upload profile photo"
      >
        <Avatar className="h-full w-full">
          {display && <AvatarImage src={display} alt="Profile photo" loading="lazy" />}
          <AvatarFallback className="bg-primary/10 text-primary text-lg">
            {fallback ?? "?"}
          </AvatarFallback>
        </Avatar>
        <div className={cn(
          "absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 text-white text-[10px] font-medium",
          "opacity-0 transition-opacity group-hover:opacity-100",
          dragOver && "opacity-100"
        )}>
          {processing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Camera className="h-5 w-5" />
              <span>Change</span>
            </>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => inputRef.current?.click()} disabled={disabled || processing}>
            <Upload className="h-3.5 w-3.5" />
            {display ? "Change" : "Upload"}
          </Button>
          {display && (
            <Button type="button" size="sm" variant="ghost" onClick={remove} disabled={disabled || processing}>
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          JPG, PNG, WEBP · max 2MB · auto-cropped to square
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onPick}
        disabled={disabled}
      />
    </div>
  );
}
