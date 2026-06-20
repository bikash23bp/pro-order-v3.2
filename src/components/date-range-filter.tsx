import { useState } from "react";
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type PresetKey =
  | "today" | "yesterday" | "last7"
  | "thisMonth" | "lastMonth"
  | "thisYear" | "lastYear" | "custom";

export interface DateRange { from: Date; to: Date }

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "7 Days" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "thisYear", label: "This Year" },
  { key: "lastYear", label: "Last Year" },
];

export function getPresetRange(key: PresetKey): DateRange {
  const now = new Date();
  switch (key) {
    case "today": return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "last7": {
      const s = subDays(now, 6);
      return { from: startOfDay(s), to: endOfDay(now) };
    }
    case "thisMonth": return { from: startOfMonth(now), to: endOfDay(now) };
    case "lastMonth": {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm) };
    }
    case "thisYear": return { from: startOfYear(now), to: endOfDay(now) };
    case "lastYear": {
      const ly = new Date(now.getFullYear() - 1, 0, 1);
      return { from: startOfYear(ly), to: endOfYear(ly) };
    }
    case "custom":
    default: return { from: startOfDay(now), to: endOfDay(now) };
  }
}

export function DateRangeFilter({
  value, preset, onChange,
}: {
  value: DateRange;
  preset: PresetKey;
  onChange: (range: DateRange, preset: PresetKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tempFrom, setTempFrom] = useState<Date | undefined>(value.from);
  const [tempTo, setTempTo] = useState<Date | undefined>(value.to);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <Button
          key={p.key}
          size="sm"
          variant={preset === p.key ? "default" : "outline"}
          onClick={() => onChange(getPresetRange(p.key), p.key)}
        >
          {p.label}
        </Button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant={preset === "custom" ? "default" : "outline"}
            className={cn("gap-2", preset !== "custom" && "text-muted-foreground")}
          >
            <CalendarIcon className="h-4 w-4" />
            {preset === "custom"
              ? `${format(value.from, "MMM d")} – ${format(value.to, "MMM d")}`
              : "Custom"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 pointer-events-auto" align="end">
          <div className="p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="mb-1 text-muted-foreground">From</div>
                <Calendar mode="single" selected={tempFrom} onSelect={setTempFrom} className="p-0 pointer-events-auto" />
              </div>
              <div>
                <div className="mb-1 text-muted-foreground">To</div>
                <Calendar mode="single" selected={tempTo} onSelect={setTempTo} className="p-0 pointer-events-auto" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                disabled={!tempFrom || !tempTo}
                onClick={() => {
                  if (!tempFrom || !tempTo) return;
                  const f = tempFrom <= tempTo ? tempFrom : tempTo;
                  const t = tempFrom <= tempTo ? tempTo : tempFrom;
                  onChange({ from: startOfDay(f), to: endOfDay(t) }, "custom");
                  setOpen(false);
                }}
              >Apply</Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
