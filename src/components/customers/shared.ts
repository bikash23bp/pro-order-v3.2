export const PAGE_SIZES = [10, 20, 25, 50, 500, 1000];

export type DatePreset = "all" | "today" | "week" | "month" | "custom";

export const DATE_LABEL: Record<DatePreset, string> = {
  all: "All Time", today: "Today", week: "This Week", month: "This Month", custom: "Custom",
};

export function rangeFor(preset: DatePreset, customFrom?: string, customTo?: string): [Date | null, Date | null] {
  const now = new Date();
  if (preset === "today") {
    const s = new Date(now); s.setHours(0, 0, 0, 0);
    return [s, now];
  }
  if (preset === "week") {
    const s = new Date(now); s.setDate(s.getDate() - 7); return [s, now];
  }
  if (preset === "month") {
    const s = new Date(now); s.setMonth(s.getMonth() - 1); return [s, now];
  }
  if (preset === "custom") {
    return [customFrom ? new Date(customFrom) : null, customTo ? new Date(customTo) : null];
  }
  return [null, null];
}
