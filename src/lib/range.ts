import { startOfDay, subDays, endOfDay, format, parse, isValid } from "date-fns";

export type Range = "today" | "7d" | "30d" | "alltime";

export function isRange(v: string | undefined): v is Range {
  return v === "today" || v === "7d" || v === "30d" || v === "alltime";
}

export type Bounds = { start: Date; end: Date; label: string; isAllTime: boolean };

export function rangeBounds(range: Range, now = new Date()): Bounds {
  const end = endOfDay(now);
  if (range === "today") return { start: startOfDay(now), end, label: "Today", isAllTime: false };
  if (range === "7d") return { start: startOfDay(subDays(now, 6)), end, label: "Last 7 days", isAllTime: false };
  if (range === "30d") return { start: startOfDay(subDays(now, 29)), end, label: "Last 30 days", isAllTime: false };
  return { start: new Date(0), end, label: "All time", isAllTime: true };
}

export function dateBounds(yyyymmdd: string): Bounds | null {
  const d = parse(yyyymmdd, "yyyy-MM-dd", new Date());
  if (!isValid(d)) return null;
  return {
    start: startOfDay(d),
    end: endOfDay(d),
    label: format(d, "EEE, MMM d, yyyy"),
    isAllTime: false,
  };
}

export function toIsoDate(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export function toIso(d: Date) {
  return d.toISOString();
}
