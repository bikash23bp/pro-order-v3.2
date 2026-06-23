import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type DateRange = { from: Date; to: Date };
export type PresetKey = "all" | "today" | "yesterday" | "week" | "month" | "year" | "last365" | "custom";

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function presetRange(p: PresetKey): DateRange {
  const now = new Date();
  switch (p) {
    case "all":
      return { from: new Date(0), to: endOfDay(now) };
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "week": {
      const day = now.getDay() || 7; // make Sunday = 7
      const start = new Date(now);
      start.setDate(now.getDate() - (day - 1));
      return { from: startOfDay(start), to: endOfDay(now) };
    }
    case "month":
      return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
    case "year":
      return { from: startOfDay(new Date(now.getFullYear(), 0, 1)), to: endOfDay(now) };
    case "last365": {
      const start = new Date(now);
      start.setDate(now.getDate() - 364);
      return { from: startOfDay(start), to: endOfDay(now) };
    }
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "year", label: "This Year" },
  { key: "last365", label: "Last 1 Year" },
];

export function DateRangeFilter({
  value,
  preset,
  onChange,
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
          onClick={() => onChange(presetRange(p.key), p.key)}
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
                <Calendar
                  mode="single"
                  selected={tempFrom}
                  onSelect={setTempFrom}
                  className="p-0 pointer-events-auto"
                />
              </div>
              <div>
                <div className="mb-1 text-muted-foreground">To</div>
                <Calendar
                  mode="single"
                  selected={tempTo}
                  onSelect={setTempTo}
                  className="p-0 pointer-events-auto"
                />
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
              >
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
