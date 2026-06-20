import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Tag as TagIcon, Loader2, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getCustomerTags,
  setCustomerTags,
  CUSTOMER_TAGS,
  TAG_LABEL,
  TAG_TONE,
  type CustomerTag,
} from "@/lib/tags.functions";
import type { CustomerTagDetail } from "@/lib/customers.functions";

export function TagBadges({
  tags,
  details,
  className,
  size = "sm",
}: {
  tags: CustomerTag[] | undefined;
  /** Optional per-tag metadata for tooltips (who tagged + when) */
  details?: CustomerTagDetail[];
  className?: string;
  size?: "xs" | "sm";
}) {
  if (!tags?.length) return null;
  const pad = size === "xs" ? "px-1 py-0 text-[10px]" : "px-1.5 py-0 text-[11px]";
  const detailFor = (t: CustomerTag) => details?.find((d) => d.tag === t);
  return (
    <TooltipProvider delayDuration={150}>
      <div className={`flex flex-wrap gap-1 ${className ?? ""}`}>
        {tags.map((t) => {
          const d = detailFor(t);
          const badge = (
            <Badge key={t} variant="outline" className={`${TAG_TONE[t]} ${pad} cursor-default`}>
              {TAG_LABEL[t]}
            </Badge>
          );
          if (!d) return badge;
          let when = "";
          try {
            when = formatDistanceToNow(new Date(d.created_at), { addSuffix: true });
          } catch { /* ignore */ }
          return (
            <Tooltip key={t}>
              <TooltipTrigger asChild><span>{badge}</span></TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <div>Tagged by <strong>{d.created_by_name ?? "Unknown"}</strong></div>
                <div className="text-muted-foreground">
                  {when}{" · "}{new Date(d.created_at).toLocaleString()}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

export function CustomerTagPicker({
  phone,
  initialTags,
  onChange,
  buttonLabel = "Tags",
  buttonSize = "sm",
  buttonVariant = "outline",
  showBadgesInline = true,
}: {
  phone: string;
  /** If provided, skips initial fetch */
  initialTags?: CustomerTag[];
  onChange?: (tags: CustomerTag[]) => void;
  buttonLabel?: string;
  buttonSize?: "sm" | "xs" | "icon";
  buttonVariant?: "outline" | "ghost" | "secondary";
  showBadgesInline?: boolean;
}) {
  const fetchTags = useServerFn(getCustomerTags);
  const saveTags = useServerFn(setCustomerTags);

  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(!!initialTags);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState<CustomerTag[]>(initialTags ?? []);

  useEffect(() => {
    if (initialTags) {
      setTags(initialTags);
      setLoaded(true);
    }
  }, [initialTags?.join(",")]);

  // Auto-load tags whenever phone changes (so badges show without opening popover)
  useEffect(() => {
    if (initialTags) return;
    const p = phone?.trim();
    if (!p) { setTags([]); setLoaded(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchTags({ data: { phone: p } });
        if (cancelled) return;
        setTags(list);
        setLoaded(true);
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [phone, initialTags]);

  const ensureLoaded = async () => {
    if (loaded || !phone) return;
    setLoading(true);
    try {
      const list = await fetchTags({ data: { phone } });
      setTags(list);
      setLoaded(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load tags");
    } finally {
      setLoading(false);
    }
  };

  const toggle = async (t: CustomerTag) => {
    if (!phone) return toast.error("Phone number missing");
    const next = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t];
    setSaving(true);
    try {
      await saveTags({ data: { phone, tags: next } });
      setTags(next);
      onChange?.(next);
      const { invalidatePhoneTags } = await import("@/hooks/use-tag-discounts");
      invalidatePhoneTags();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const btnSize = buttonSize === "icon" ? "icon" : "sm";

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      {showBadgesInline && loaded && tags.length > 0 && (
        <TagBadges tags={tags} size="xs" />
      )}
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) ensureLoaded();
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            size={btnSize as any}
            variant={buttonVariant}
            className={buttonSize === "xs" ? "h-7 px-2 text-xs" : ""}
            disabled={!phone}
            title={phone ? "Edit customer tags" : "Phone required"}
          >
            <TagIcon className="h-3.5 w-3.5" />
            {buttonSize !== "icon" && <span>{buttonLabel}</span>}
            {loaded && tags.length > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] text-primary">
                {tags.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-2">
          <div className="px-1.5 pb-1.5 text-xs font-medium text-muted-foreground">
            Customer Tags
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="space-y-0.5">
              {CUSTOMER_TAGS.map((t) => {
                const on = tags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={saving}
                    onClick={() => toggle(t)}
                    className={`w-full flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent ${
                      on ? "bg-accent/60" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${TAG_TONE[t].split(" ")[0].replace("bg-", "bg-")}`}
                      />
                      {TAG_LABEL[t]}
                    </span>
                    {on && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                );
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
